import {
    AckStatus,
    ApiPlatform,
    BootstrapMode,
    ButtonType,
    ChangeType,
    DialogMode,
    HeartbeatMode,
    MenuCommandType
} from "./protocol/TagValEnums";
import {TagValProtocolHandler, TcProtocolHandler, toPrintableMessage} from "./protocol/TagValProtocol";
import {MenuTree} from "./MenuTree";
import {AnalogMenuItem, BooleanMenuItem, EnumMenuItem, ScrollChoice, ScrollChoiceMenuItem} from "./MenuItem";
import {
    AcknowledgmentCommand,
    BootstrapCommand,
    DialogUpdateCommand,
    HeartbeatCommand,
    ItemChangeCommand,
    JoinCommand,
    MenuCommand,
    PairingCommand
} from "./protocol/MenuCommands";

export type APIMessageHandler = (protocol: number, rawMessage: string) => void;
export type APIConnectionListener = (connected: boolean, text: string) => void;
export type DialogUpdateCallback = (shown: boolean, title: string, content: string, btn1: ButtonType, btn2: ButtonType) => void;
export type PairingCallback = (update: string) => void;

export interface APIConnector {
    start(): void;
    stop(): void;
    closeConnection(): void;
    sendMessage(rawMessage: string): void;
    registerMessageHandler(messageHandler: APIMessageHandler): void;
    registerConnectionListener(connectionListener: APIConnectionListener): void;
    isConnected(): boolean;
    getName(): string;
    lastDisconnectTime(): number;
}

export interface MenuComponent {
    structureHasChanged(): void;
    itemHasUpdated(): void;
    tick(timeNow: number): void;
    ackReceived(correlationId: number, ackStatus: AckStatus): void;
}

export interface AppInfo {
    getAppName(): string;
    getAppUuid(): string;
}

let staticCorCount = 0;
function makeCorrelation(): number {
    return Math.floor((Math.random() * 0xfffff) + (++staticCorCount));
}

export enum ControllerState {
    STOPPED,
    NOT_CONNECTED,
    CONNECTED,
    BOOTSTRAP,
    READY,
    FAILED_AUTHENTICATION,
    PAIRED_OK
}

function niceState(currentState: ControllerState) {
    switch (currentState) {
        case ControllerState.CONNECTED: return "Connected";
        case ControllerState.BOOTSTRAP: return "Receiving Items";
        case ControllerState.READY: return "Ready";
        case ControllerState.FAILED_AUTHENTICATION: return "Not Authorized";
        case ControllerState.PAIRED_OK: return "Paired";
        case ControllerState.STOPPED:
        case ControllerState.NOT_CONNECTED: return "Not Connected";
    }
}

function nicePlatform(platform: ApiPlatform) {
    switch (platform) {
        case ApiPlatform.ARDUINO:
        case ApiPlatform.ARDUINO_32: return "Arduino";
        case ApiPlatform.JAVA_API: return "Java/PI";
        case ApiPlatform.DNET_API: return ".NET";
        case ApiPlatform.JS_API: return "JS"
    }
}

export type MenuStateListener = (update: ControllerState) => void;

export type CustomMessageHandler = (cmd: MenuCommand) => void;

export class MenuController {
    private readonly menuTree: MenuTree;
    private readonly protocolHandler: TcProtocolHandler;
    private appInfo: AppInfo;
    private componentsById: {[id: string]: MenuComponent} = {};
    private lastHeartbeatRx: number;
    private lastHeartbeatTx: number;
    private hbFrequency: number = 1500;
    private currentConnection: string = "";
    private appName: string = "";
    private appVersion: number = 0.0;
    private appPlatform: ApiPlatform = ApiPlatform.JS_API;
    private connector: APIConnector;
    private dialogListener: DialogUpdateCallback|undefined;
    private currentState: ControllerState = ControllerState.STOPPED;
    private stateListener: MenuStateListener|undefined = undefined;
    private pairingMode: boolean = false;
    private customMessageHandler: CustomMessageHandler;

    public constructor(connector: APIConnector, appInfo: AppInfo) {
        this.appInfo = appInfo;
        this.menuTree = new MenuTree((menuTree, id) => this.rebuildTree(false));
        this.lastHeartbeatRx = this.lastHeartbeatTx = Date.now();
        this.connector = connector;
        this.protocolHandler = new TagValProtocolHandler(this.menuTree);
        this.customMessageHandler = (m) => console.warn(`unhandled message on ${this.connector.getName()} - ${m}`);
    }

    private setCurrentState(state: ControllerState) {
        this.currentState = state;
        if(this.stateListener) this.stateListener(state);
    }

    public getCurrentState(): ControllerState {
        return this.currentState;
    }

    public registerStateListener(l: MenuStateListener): void {
        this.stateListener = l;
        l(this.currentState);
    }

    public isRunning(): boolean {
        return this.currentState !== ControllerState.STOPPED && this.currentState !== ControllerState.FAILED_AUTHENTICATION;
    }

    public start() {
        if(this.isRunning()) return;
        this.connector.registerMessageHandler((proto, msg) => this.messageProcessor(msg));
        this.setCurrentState(ControllerState.NOT_CONNECTED);

        this.connector.registerConnectionListener((connected, why) => {
            if(connected) {
                this.setCurrentState(ControllerState.CONNECTED);
                this.lastHeartbeatRx = this.lastHeartbeatTx = Date.now();
                this.sendMessage(
                    this.protocolHandler.convertCommandToWire(new HeartbeatCommand(this.hbFrequency, HeartbeatMode.START))
                );
                if(this.pairingMode) {
                    this.sendMessage(this.protocolHandler.convertCommandToWire(
                        new PairingCommand(this.appInfo.getAppName(), this.appInfo.getAppUuid()))
                    );
                } else {
                    this.sendMessage(this.protocolHandler.convertCommandToWire(
                        new JoinCommand(this.appInfo.getAppName(), this.appInfo.getAppUuid(), ApiPlatform.JS_API, parseAppVersion()))
                    );
                }
                this.menuTree.emptyTree();
                this.rebuildTree(false);
            }
            else {
                this.setCurrentState(ControllerState.NOT_CONNECTED);
                this.menuTree.emptyTree();
                this.rebuildTree(true);
            }
        })

        this.checkHeartbeats();

        this.tickAllElements();

        this.connector.start();
    }

    public async attemptPairing(cb: PairingCallback): Promise<boolean> {
        this.stop();
        this.pairingMode = true;
        this.start();
        const startTime = Date.now();

        try {
            while ((Date.now() - startTime) < 60000) {
                if (this.currentState === ControllerState.FAILED_AUTHENTICATION) return false;
                if(this.currentState === ControllerState.PAIRED_OK) return true;
                cb(niceState(this.currentState));
                await delay(500);
            }
        }
        finally {
            this.stop();
            this.pairingMode = false;
        }
        return false;
    }

    public stop() {
        this.pairingMode = false;
        this.setCurrentState(ControllerState.STOPPED);
        this.connector?.closeConnection();
        this.menuTree.emptyTree();
        this.componentsById = {};
    }

    private tickAllElements() {
        if(this.connector.isConnected()) {
            const dt = Date.now();
            Object.values(this.componentsById).forEach(comp => comp.tick(dt));

        }
        setTimeout(this.tickAllElements.bind(this), this.connector.isConnected() ? 100 : 1000);
    }

    private checkHeartbeats() {
        const now = Date.now();
        if(this.connector.isConnected() && (now - this.lastHeartbeatRx) > (this.hbFrequency * 3)) {
            console.error("Connecting closing due to inactivity" + this.connector.getName())
            this.connector.closeConnection();
        }

        if(this.connector.isConnected() && (now - this.lastHeartbeatTx) > this.hbFrequency) {
            this.sendMessage(this.protocolHandler.convertCommandToWire(
                new HeartbeatCommand(this.hbFrequency, HeartbeatMode.NORMAL)
            ));
        }

        if(!this.connector.isConnected() && (now - this.connector.lastDisconnectTime()) > (this.pairingMode ? 4000 : 8000)) {
            this.connector.start();
        }

        if(this.isRunning()) setTimeout( () => this.checkHeartbeats(), 500);
    }

    public getTree() { return this.menuTree; }

    public getMenuName(): string {
        if(this.connector.isConnected()) {
            return this.appName + ", V" + this.appVersion + " " + nicePlatform(this.appPlatform);
        }
        else {
            return "Lost connection";
        }
    }

    private rebuildTree(cleanComponents: boolean) {
        if(cleanComponents) {
            console.info("Cleaning down components");
            let rootId = this.menuTree.getRoot().getMenuId();
            let rootComponent = this.componentsById[rootId];
            this.componentsById = {};
            if(rootComponent) this.componentsById[rootId] = rootComponent;
        }

        if(this.currentState === ControllerState.READY) {
            Object.values(this.componentsById).forEach(comp => comp.structureHasChanged());
        }
    }

    public putMenuComponent(id: string, comp: MenuComponent) {
        this.componentsById[id] = comp;
    }

    sendActionableUpdate(itemId: string): number|undefined {
        try {
            let item = this.menuTree.getMenuItemFor(itemId);
            if (!item) return undefined;
            const val = (item instanceof BooleanMenuItem) ? !item.getCurrentValue() : false;
            const correlation = makeCorrelation();
            this.sendMessage(this.protocolHandler.convertCommandToWire(
                new ItemChangeCommand(item.getMenuId(), ChangeType.ABSOLUTE, val ? "1":"0", correlation.toString(16))
            ));

            return correlation;
        }
        catch(e) {
            console.error(`Action update was not sent for ${itemId}`);
            this.connector.closeConnection();
        }
    }

    sendListResponseUpdate(itemId: string, row: number, doubleClick: boolean): number|undefined {
        try {
            let correlation = makeCorrelation();
            const listResponse = row.toString() + ":" + (doubleClick ? "1" : "0");
            this.sendMessage(this.protocolHandler.convertCommandToWire(
                new ItemChangeCommand(itemId, ChangeType.LIST_SELECTION, listResponse, correlation.toString(16))
            ));
            return correlation;
        }
        catch (e) {
            console.error("List response was not sent for " + itemId + " row " + row);
            this.connector.closeConnection();
        }
    }

    sendAbsoluteUpdate(itemId: string, amt: string): number|undefined {
        try {
            const item = this.menuTree.getMenuItemFor(itemId);
            const correlation = makeCorrelation();
            this.sendMessage(this.protocolHandler.convertCommandToWire(
                new ItemChangeCommand(item.getMenuId(), ChangeType.ABSOLUTE, amt, correlation.toString(16))
            ));
            return correlation;
        }
        catch (e) {
            console.error(`Update was not sent for ${itemId} change ${amt}`, e);
            this.connector.closeConnection();
        }
    }

    sendDialogAction(button: ButtonType): number|undefined {
        try {
            const correlation = makeCorrelation();
            this.sendMessage(this.protocolHandler.convertCommandToWire(
                new DialogUpdateCommand(DialogMode.ACTION, "", "", button, button, correlation.toString(16))
            ));
            return correlation;
        }
        catch (e) {
            console.error(`Dialog action not sent for ${button}`, e);
            this.connector.closeConnection();
        }
    }

    sendDeltaUpdate(itemId: string, amt: number): number|undefined {
        try {
            const correlation = makeCorrelation();
            let item = this.menuTree.getMenuItemFor(itemId);
            if(item instanceof ScrollChoiceMenuItem) {
                let sp = item.getCurrentValue();
                sp.currentPos += amt;
                this.sendMessage(this.protocolHandler.convertCommandToWire(
                    new ItemChangeCommand(item.getMenuId(), ChangeType.ABSOLUTE, sp.asString(), correlation.toString(16))
                ));
                return correlation;
            } else if ((item instanceof AnalogMenuItem) || (item instanceof EnumMenuItem)) {
                this.sendMessage(this.protocolHandler.convertCommandToWire(
                    new ItemChangeCommand(item.getMenuId(), ChangeType.DELTA, amt.toFixed(0), correlation.toString(16))
                ));
                return correlation;
            }
        }
        catch(e) {
            console.error(`Delta update was not sent for ${itemId} change ${amt}`, e);
            this.connector.closeConnection();
        }
    }

    private messageProcessor(msg: string): void {
        const possibleMsg = this.protocolHandler.convertWireToCommand(msg);
        if(!possibleMsg) return;
        this.lastHeartbeatRx = Date.now();

        switch (possibleMsg.commandType) {
            case MenuCommandType.JOIN:
                this.joinReceived(possibleMsg as JoinCommand);
                break;
            case MenuCommandType.CHANGE_INT_FIELD:
                this.itemHasUpdated(possibleMsg as ItemChangeCommand);
                break;
            case MenuCommandType.HEARTBEAT:
                this.heartbeatReceived(possibleMsg as HeartbeatCommand);
                break;
            case MenuCommandType.PAIRING_REQUEST:
                this.pairingRequest(possibleMsg as PairingCommand);
                break;
            case MenuCommandType.DIALOG_UPDATE:
                this.dialogHasUpdated(possibleMsg as DialogUpdateCommand);
                break;
            case MenuCommandType.BOOTSTRAP:
                this.bootstrapEvent(possibleMsg as BootstrapCommand);
                break;
            case MenuCommandType.ACKNOWLEDGEMENT:
                this.acknowledgement(possibleMsg as AcknowledgmentCommand);
                break;
            case MenuCommandType.BOOT_SCROLL_CHOICE:
            case MenuCommandType.BOOT_RGB_COLOR:
            case MenuCommandType.ENUM_BOOT_ITEM:
            case MenuCommandType.LARGE_NUM_BOOT_ITEM:
            case MenuCommandType.ANALOG_BOOT_ITEM:
            case MenuCommandType.BOOLEAN_BOOT_ITEM:
            case MenuCommandType.FLOAT_BOOT_ITEM:
            case MenuCommandType.RUNTIME_LIST_BOOT:
            case MenuCommandType.TEXT_BOOT_ITEM:
            case MenuCommandType.ACTION_BOOT_ITEM:
            case MenuCommandType.SUBMENU_BOOT_ITEM:
                console.info("Incoming boot command rx but already processed by protocol", possibleMsg.commandType);
                break;
            default:
                this.customMessageHandler(possibleMsg);
                break;
        }
    }

    public heartbeatReceived(hb: HeartbeatCommand) {
        this.hbFrequency = hb.frequency;
        console.log("hbrx: " + hb.mode + ", freq: " + hb.frequency);
    }

    public pairingRequest(pair: PairingCommand) {
        console.log("Pair: " + pair.appName + ", uuid: " + pair.appUuid);
    }

    dialogHasUpdated(dlg: DialogUpdateCommand) {
        if(this.dialogListener) this.dialogListener(dlg.mode === DialogMode.SHOW, dlg.header, dlg.buffer,
            dlg.button1, dlg.button2);
    }

    joinReceived(join: JoinCommand) {
        this.currentConnection = join.name;
        this.appName = join.name;
        this.appVersion = join.version;
        this.appPlatform = join.platform;
        this.componentsById["0"].structureHasChanged();

        console.log("join: " + this.appName + ", uuid: " + join.uuid + ", platform: " + this.appPlatform + ", ver: " + this.appVersion);
    }

    public bootstrapEvent(evt: BootstrapCommand) {
        let gotStart = (evt.bootstrapMode === BootstrapMode.START);
        this.setCurrentState(gotStart ? ControllerState.BOOTSTRAP : ControllerState.READY);
        if(!gotStart) this.rebuildTree(false);

        console.debug("Boot event " + evt.bootstrapMode);
    }

    public acknowledgement(ack: AcknowledgmentCommand) {
        console.debug("acknowledgement received " + ack.correlation + " - " + ack.status);
        if(ack.correlation && parseInt(ack.correlation, 16) > 0) {
            Object.values(this.componentsById).forEach(item => item.ackReceived(parseInt(ack.correlation, 16), ack.status));
        }
        else if(this.currentState === ControllerState.CONNECTED) {
            if(ack.status !== AckStatus.SUCCESS) {
                this.setCurrentState(ControllerState.FAILED_AUTHENTICATION);
            }
            else if(this.pairingMode) {
                this.setCurrentState(ControllerState.PAIRED_OK);
            }
        }
    }


    itemHasUpdated(chg: ItemChangeCommand) {
        let item = this.menuTree.getMenuItemFor(chg.menuId);
        if(!item) return;
        switch(item.messageType) {
            case "Analog":
            case "Enum":
                item.setCurrentValue(parseInt(chg.value.toString(), 10));
                break;
            case "LargeNum":
                item.setCurrentValue(parseFloat(chg.value.toString()));
                break;
            case "Boolean":
                item.setCurrentValue(parseInt(chg.value.toString()));
                break;
            case "Scroll":
                item.setCurrentValue(ScrollChoice.fromString(chg.value.toString()));
                break;
            case "List":
                item.setCurrentValue(chg.value as string[]);
                break;
            default:
                item.setCurrentValue(chg.value.toString());
                break;
        }
        this.componentsById[chg.menuId]?.itemHasUpdated();
    }

    public sendMessage(data: string) {
        try {
            console.debug(`Sending message to ${this.connector.getName()} content: ${toPrintableMessage(data)}`);
            this.connector.sendMessage(data);
            this.lastHeartbeatTx = Date.now();
        }
        catch(e) {
            console.log("Exception caught during send: " + e);
            this.connector.closeConnection();
        }
    }

    public registerCustomMessageHandler(customHandler: CustomMessageHandler): void {
        this.customMessageHandler = customHandler;
    }

    registerDialogListener(listener: DialogUpdateCallback) {
        this.dialogListener = listener;
    }
}

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

function parseAppVersion(): number {
    const rawVersion = process.env.REACT_APP_VERSION;
    if(!rawVersion) return 0;

    const regex = /(\d+)\.(\d+).*/;
    const match = rawVersion.match(regex);
    if(match && match.length > 1) {
        return (parseInt(match[0]) * 100) + parseInt(match[1]);
    }
    return 0;
}