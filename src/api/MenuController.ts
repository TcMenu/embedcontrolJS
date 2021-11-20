import {AckStatus, ButtonType, HeartbeatMode} from "./TagValEnums";
import {TagValProtocolHandler, TagValProtocolParser, toPrintableMessage} from "./TagValProtocol";
import {MenuTree} from "./MenuTree";
import {AnalogMenuItem, BooleanMenuItem, EnumMenuItem, ScrollChoice, ScrollChoiceMenuItem} from "./MenuItem";

export type APIMessageHandler = (protocol: number, rawMessage: string) => void;
export type APIConnectionListener = (connected: boolean, text: string) => void;
export type DialogUpdateCallback = (shown: boolean, title: string, content: string, btn1: ButtonType, btn2: ButtonType) => void;

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
    name: string;
    uuid: string;
}

let staticCorCount = 0;
function makeCorrelation(): number {
    return Math.floor((Math.random() * 0xfffff) + (++staticCorCount));
}

export class MenuController {
    private readonly menuTree: MenuTree;
    private appInfo: AppInfo;
    private componentsById: {[id: string]: MenuComponent} = {};
    private lastHeartbeatRx: number;
    private lastHeartbeatTx: number;
    private hbFrequency: number = 1500;
    private currentConnection: string = "";
    private appName: string = "";
    private appVersion: number = 0.0;
    private bootInProgress: boolean = false;
    private connector: APIConnector;
    private tagValProtocol: TagValProtocolHandler;
    private controllerRunning: boolean = false;
    private dialogListener: DialogUpdateCallback|undefined;

    public constructor(connector: APIConnector, appInfo: AppInfo) {
        this.appInfo = appInfo;
        this.menuTree = new MenuTree((menuTree, id) => this.rebuildTree(false));
        this.tagValProtocol = new TagValProtocolHandler(this);
        this.lastHeartbeatRx = this.lastHeartbeatTx = Date.now();
        this.connector = connector;
    }

    public start() {
        this.connector.registerMessageHandler((proto, msg) => this.tagValProtocol.tagValToMenuItem(msg));
        this.controllerRunning = true;

        this.connector.registerConnectionListener((connected, why) => {
            if(connected) {
                this.sendMessage(this.tagValProtocol.buildHeartbeat(HeartbeatMode.START));
                this.sendMessage(this.tagValProtocol.buildJoin(this.appInfo.name, this.appInfo.uuid));
                this.menuTree.emptyTree();
                this.rebuildTree(false);
            }
            else {
                this.menuTree.emptyTree();
                this.rebuildTree(true);
            }
        })

        this.checkHeartbeats();

        setInterval(() => {
            const dt = Date.now();
            Object.values(this.componentsById).forEach(comp => comp.tick(dt));
        });

        this.connector.start();
    }

    private checkHeartbeats() {
        const now = Date.now();
        if(this.connector.isConnected() && (now - this.lastHeartbeatRx) > (this.hbFrequency * 3)) {
            console.error("Connecting closing due to inactivity" + this.connector.getName())
            this.connector.closeConnection();
        }

        if(this.connector.isConnected() && (now - this.lastHeartbeatTx) > this.hbFrequency) {
            this.sendMessage(this.tagValProtocol.buildHeartbeat(HeartbeatMode.NORMAL));
        }

        if(!this.connector.isConnected() && (now - this.connector.lastDisconnectTime()) > 8000) {
            this.connector.start();
        }

        if(this.controllerRunning) setTimeout( () => this.checkHeartbeats(), 500);
    }

    public bootstrapEvent(mode: string) {
        let gotStart = (mode === "START");
        this.bootInProgress = gotStart;
        if(!gotStart) this.rebuildTree(false);

        console.debug("Boot event " + mode);
    }

    public acknowledgement(correlationId: string, ackStatus: AckStatus) {
        console.debug("acknowledgement received " + correlationId + " - " + ackStatus);
        if(correlationId && parseInt(correlationId, 16) > 0) {
            Object.values(this.componentsById).forEach(item => item.ackReceived(parseInt(correlationId, 16), ackStatus));
        }
    }

    public getTree() { return this.menuTree; }

    public heartbeatReceived(mode: HeartbeatMode, freq: number) {
        this.hbFrequency = freq;
        console.log("hbrx: " + mode + ", freq: " + freq);
    }

    public pairingRequest(name: string, uuid: string) {
        console.log("Pair: " + name + ", uuid: " + uuid);
    }

    dialogHasUpdated(show: boolean, title: string, content: string, b1: ButtonType, b2: ButtonType) {
        if(this.dialogListener) this.dialogListener(show, title, content, b1, b2);
    }

    joinReceived(name: string, uuid: string, platform: string, version: number) {
        this.currentConnection = name;
        this.appName = name;
        this.appVersion = version;
        this.componentsById["0"].structureHasChanged();

        console.log("join: " + name + ", uuid: " + uuid + ", platform: " + platform + ", ver: " + version);
    }

    public unhandledMsg(restOfMsg: string, parsedKeyVal: TagValProtocolParser) {
        console.warn(`unhandled message on ${this.connector.getName()} - ${restOfMsg}`);
    }

    public getMenuName(): string {
        if(this.connector.isConnected()) {
            return "Connected to " + this.appName + ", V" + this.appVersion;
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

        if(!this.bootInProgress) {
            Object.values(this.componentsById).forEach(comp => comp.structureHasChanged());
        }
    }

    public putMenuComponent(id: string, comp: MenuComponent) {
        this.componentsById[id] = comp;
    }

    getProtocol(): TagValProtocolHandler {
        return this.tagValProtocol;
    }

    sendActionableUpdate(itemId: string): number|undefined {
        try {
            let item = this.menuTree.getMenuItemFor(itemId);
            if (!item) return undefined;
            const val = (item instanceof BooleanMenuItem) ? !item.getCurrentValue() : false;
            const correlation = makeCorrelation();
            const  data = this.getProtocol().buildAbsoluteUpdate(item, val ? "1" : "0", correlation.toString(16), false);
            this.sendMessage(data);
            return correlation;
        }
        catch(e) {
            console.error(`Action update was not sent for ${itemId}`);
            this.connector.closeConnection();
        }
    }

    sendAbsoluteUpdate(itemId: string, amt: string): number|undefined {
        try {
            const item = this.menuTree.getMenuItemFor(itemId);
            const correlation = makeCorrelation();
            const data = this.tagValProtocol.buildAbsoluteUpdate(item, amt, correlation.toString(16), false);
            this.sendMessage(data);
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
            const data = this.tagValProtocol.buildDialogAction(button, correlation.toString(16));
            this.sendMessage(data);
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
                this.tagValProtocol.buildAbsoluteUpdate(item, sp.asString(), correlation.toString(16), false);
                return correlation;
            } else if ((item instanceof AnalogMenuItem) || (item instanceof EnumMenuItem)) {
                let data = this.getProtocol().buildDeltaUpdate(item, amt, correlation.toString(16));
                this.sendMessage(data);
                return correlation;
            }
        }
        catch(e) {
            console.error(`Delta update was not sent for ${itemId} change ${amt}`, e);
            this.connector.closeConnection();
        }
    }

    itemHasUpdated(itemId: string, value: string) {
        let item = this.menuTree.getMenuItemFor(itemId);
        if(!item) return;
        switch(item.messageType) {
            case "Analog":
            case "Enum":
                item.setCurrentValue(parseInt(value, 10));
                break;
            case "LargeNum":
                item.setCurrentValue(parseFloat(value));
                break;
            case "Boolean":
                item.setCurrentValue(parseInt(value));
                break;
            case "Scroll":
                item.setCurrentValue(ScrollChoice.fromString(value));
                break;
            case "List":
                break;
            default:
                item.setCurrentValue(value);
                break;
        }
        this.componentsById[itemId]?.itemHasUpdated();
    }

    private sendMessage(data: string) {
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

    registerReceivedMessage(): void {
        this.lastHeartbeatRx = Date.now();
    }

    registerDialogListener(listener: DialogUpdateCallback) {
        this.dialogListener = listener;
    }
}



