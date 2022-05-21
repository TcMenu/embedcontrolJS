import {
    ActionMenuItem,
    AnalogMenuItem,
    BooleanMenuItem,
    EditableLargeNumberMenuItem,
    EditableTextMenuItem,
    EnumMenuItem,
    FloatMenuItem,
    ListMenuItem,
    MenuItem,
    Rgb32MenuItem,
    ScrollChoice,
    ScrollChoiceMenuItem,
    SubMenuItem
} from "../MenuItem";
import {BootstrapMode, ChangeType, DialogMode, MenuCommandType, TVMenuFields} from "./TagValEnums";
import {
    AcknowledgmentCommand,
    BootstrapCommand,
    DialogUpdateCommand,
    HeartbeatCommand,
    ItemChangeCommand,
    JoinCommand,
    MenuCommand,
    MenuItemUpdateCommand,
    PairingCommand
} from "./MenuCommands";
import {MenuTree} from "../MenuTree";

export const PROTOCOL_TAG_VAL = 0x01;
export const TAG_START_OF_MSG = 0x01;
export const TAG_END_OF_MSG = 0x02;
const TAG_FIELD_TERMINATOR = '|';

type MenuCtorFunction<V extends MenuItem<any>> = (parser: TagValProtocolParser, id: string) => V;

class OutgoingMenuCommandHandler<T extends MenuCommand> {
    private readonly expectedMsgType: string;
    private readonly msgHandler: (cmd: T) => string;

    constructor(expectedMsgType: string, msgHandler: (cmd: T) => string) {
        this.expectedMsgType = expectedMsgType;
        this.msgHandler = msgHandler;
    }

    applyMsg(cmd: MenuCommand): string {
        if(cmd.commandType === this.expectedMsgType) {
            return this.msgHandler(cmd as T);
        } else {
            throw new TcProtocolError("Unexpected message type " + cmd.commandType + " when expecting " + this.expectedMsgType);
        }
    }
}

export interface TcProtocolHandler {
    addIncomingTagValHandler(msgKey: string, handler: (parser: TagValProtocolParser) => MenuCommand): void;
    addOutgoingTagValHandler(msgKey: string, handler: OutgoingMenuCommandHandler<any>): void;
    convertWireToCommand(tagValStr: string): MenuCommand | undefined;
    convertCommandToWire(menuCommand: MenuCommand): string;

}

export class TcProtocolError extends Error {
    public static UNEXPECTED_EOM: string = "Unexpected End Of Message";
    public static KEY_NOT_DEF: string = "Key not defined: ";
    public static MSG_TOO_SMALL: string = "Message too small: ";

    constructor(public message: string) {
        super(message);
        this.name = "TcProtocolError";
        ({stack: this.stack} = (new Error() as any));
    }

}

export class TagValProtocolParser {
    private keyToValueMap: { [id:string]: string } = {};
    private parseData: string = "";
    private position: number = 0;

    public startParseData(dataToParse: string) {
        this.position = 0;
        this.keyToValueMap = {};
        this.parseData = dataToParse;
        let foundEnd = false;
        while (this.position < this.parseData.length && !foundEnd) {
            if (this.parseData.charCodeAt(this.position) === TAG_END_OF_MSG) {
                break;
            }

            let key = this.readString();
            if (!key) {
                throw new TcProtocolError(TcProtocolError.UNEXPECTED_EOM);
            } else {
                let val = this.readString();
                if (!val && val.charCodeAt(0) === TAG_END_OF_MSG) {
                    foundEnd = true;
                }
                this.keyToValueMap[key] = val;
            }
        }
    }

    readString(): string {
        let value = "";
        while (this.position < this.parseData.length) {
            let ch = this.parseData.charAt(this.position++);
            if (ch === '\\') {
                // special escape case allows anything to be sent
                ch = this.parseData.charAt(this.position++);
                value += ch;
            } else if (ch === '=' || ch === TAG_FIELD_TERMINATOR) {
                // end of current token
                return value;
            } else {
                // within current token
                value += ch;
            }
        }
        return value;
    }

    getValue(key: string): string {
        const ret = this.keyToValueMap[key];
        if (!ret) throw new TcProtocolError(TcProtocolError.KEY_NOT_DEF + key);
        return ret;
    }

    getValueAsInt(key: string): number {
        return parseInt(this.getValue(key));
    }

    getValueWithDefault(key: string, def: string): string {
        const ret = this.keyToValueMap[key];
        return ret ?? def;
    }

    getValueAsIntWithDefault(key: string, def: number): number {
        const ret = this.keyToValueMap[key];
        return (ret) ? parseInt(ret) : def;
    }
}

export class TagValProtocolHandler implements TcProtocolHandler {
    private readonly parsedKeyVal: TagValProtocolParser;
    private readonly tree: MenuTree;
    private readonly incomingTagValMsgProcessors: {[key: string]: (parser: TagValProtocolParser) => MenuCommand} = {}
    private readonly outgoingTagValMsgProcessors: {[key: string]: OutgoingMenuCommandHandler<any>} = {}

    public constructor(tree: MenuTree) {
        this.parsedKeyVal = new TagValProtocolParser();
        this.tree = tree;
        this.initialiseProtocol();
    }

    public addIncomingTagValHandler(msgKey: string, handler: (parser: TagValProtocolParser) => MenuCommand): void {
        this.incomingTagValMsgProcessors[msgKey] = handler;
    }

    public addOutgoingTagValHandler(msgKey: string, handler: OutgoingMenuCommandHandler<any>): void {
        this.outgoingTagValMsgProcessors[msgKey] = handler;
    }

    private initialiseProtocol() {
        this.incomingTagValMsgProcessors[MenuCommandType.HEARTBEAT] = (parser) => new HeartbeatCommand(
                    parser.getValueAsIntWithDefault(TVMenuFields.HB_FREQUENCY_FIELD, 1500),
                    parser.getValueAsInt(TVMenuFields.HB_MODE_FIELD)
        );

        this.incomingTagValMsgProcessors[MenuCommandType.BOOTSTRAP] = (parser) => new BootstrapCommand(
            parser.getValue(TVMenuFields.KEY_BOOT_TYPE_FIELD) === "START" ? BootstrapMode.START : BootstrapMode.STOP);
        this.incomingTagValMsgProcessors[MenuCommandType.ACKNOWLEDGEMENT] = (parser) => new AcknowledgmentCommand(
                    parser.getValueAsInt(TVMenuFields.KEY_ACK_STATUS),
                    parser.getValue(TVMenuFields.KEY_CORRELATION_FIELD)
        );

        this.incomingTagValMsgProcessors[MenuCommandType.DIALOG_UPDATE] = parser => new DialogUpdateCommand(
                    fromTextToDlgMode(parser.getValue(TVMenuFields.KEY_MODE_FIELD)),
                    parser.getValueWithDefault(TVMenuFields.KEY_HEADER_FIELD, ""),
                    parser.getValueWithDefault(TVMenuFields.KEY_BUFFER_FIELD, ""),
                    parser.getValueAsIntWithDefault(TVMenuFields.KEY_BUTTON1_FIELD, 0),
                    parser.getValueAsIntWithDefault(TVMenuFields.KEY_BUTTON2_FIELD, 0),
                    parser.getValueWithDefault(TVMenuFields.KEY_CORRELATION_FIELD, "0")
        );
        this.incomingTagValMsgProcessors[MenuCommandType.JOIN] = parser => new JoinCommand(
                    parser.getValue(TVMenuFields.KEY_NAME_FIELD),
                    parser.getValue(TVMenuFields.KEY_UUID_FIELD),
                    parser.getValueAsIntWithDefault(TVMenuFields.KEY_PLATFORM_ID, 0),
                    parseFloat(parser.getValue(TVMenuFields.KEY_VER_FIELD)) / 100.0
        );

        this.incomingTagValMsgProcessors[MenuCommandType.CHANGE_INT_FIELD] = parser => incomingChangeMessage(parser);

        this.incomingTagValMsgProcessors[MenuCommandType.PAIRING_REQUEST] = parser => new PairingCommand(
            parser.getValue(TVMenuFields.KEY_NAME_FIELD),
            parser.getValue(TVMenuFields.KEY_UUID_FIELD)
        );

        this.incomingTagValMsgProcessors[MenuCommandType.SUBMENU_BOOT_ITEM] = parser => this.processSubMenuItem(parser);
        this.incomingTagValMsgProcessors[MenuCommandType.ANALOG_BOOT_ITEM] = parser => this.processAnalogItem(parser);
        this.incomingTagValMsgProcessors[MenuCommandType.BOOLEAN_BOOT_ITEM] = parser => this.processBooleanItem(parser);
        this.incomingTagValMsgProcessors[MenuCommandType.ACTION_BOOT_ITEM] = parser => this.processActionItem(parser);
        this.incomingTagValMsgProcessors[MenuCommandType.BOOT_RGB_COLOR] = parser => this.processRgbItem(parser);
        this.incomingTagValMsgProcessors[MenuCommandType.FLOAT_BOOT_ITEM] = parser => this.processFloatItem(parser);
        this.incomingTagValMsgProcessors[MenuCommandType.ENUM_BOOT_ITEM] = parser => this.processEnumItem(parser);
        this.incomingTagValMsgProcessors[MenuCommandType.LARGE_NUM_BOOT_ITEM] = parser => this.processLargeNumItem(parser);
        this.incomingTagValMsgProcessors[MenuCommandType.RUNTIME_LIST_BOOT] = parser => this.processListItem(parser);
        this.incomingTagValMsgProcessors[MenuCommandType.BOOT_SCROLL_CHOICE] = parser => this.processScrollChoiceItem(parser);
        this.incomingTagValMsgProcessors[MenuCommandType.TEXT_BOOT_ITEM] = parser => this.processTextItem(parser);

        this.outgoingTagValMsgProcessors[MenuCommandType.HEARTBEAT] = new OutgoingMenuCommandHandler<HeartbeatCommand>(MenuCommandType.HEARTBEAT,
            (cmd) => this.buildHeartbeat(cmd));
        this.outgoingTagValMsgProcessors[MenuCommandType.JOIN] = new OutgoingMenuCommandHandler<JoinCommand>(MenuCommandType.JOIN,
            (cmd) => this.buildJoin(cmd));
        this.outgoingTagValMsgProcessors[MenuCommandType.PAIRING_REQUEST] = new OutgoingMenuCommandHandler<PairingCommand>(MenuCommandType.PAIRING_REQUEST,
            (cmd) => this.buildPairing(cmd));
        this.outgoingTagValMsgProcessors[MenuCommandType.DIALOG_UPDATE] = new OutgoingMenuCommandHandler<DialogUpdateCommand>(MenuCommandType.HEARTBEAT,
            (cmd) => this.buildDialogAction(cmd));
        this.outgoingTagValMsgProcessors[MenuCommandType.CHANGE_INT_FIELD] = new OutgoingMenuCommandHandler<ItemChangeCommand>(MenuCommandType.CHANGE_INT_FIELD,
            (cmd) => this.buildUpdate(cmd));
    }


    public convertWireToCommand(tagValStr: string): MenuCommand | undefined {
        if (tagValStr.length < 3) throw new TcProtocolError(TcProtocolError.MSG_TOO_SMALL + tagValStr);
        let msgType = tagValStr.substr(0, 2);
        let restOfMsg = tagValStr.substr(2);
        let parser = this.parsedKeyVal;
        parser.startParseData(restOfMsg);
        let processor = this.incomingTagValMsgProcessors[msgType];
        if(!processor) return undefined;
        return processor(parser);
    }

    public convertCommandToWire(menuCommand: MenuCommand): string {
        if(!menuCommand) throw new TcProtocolError("Unexpected null message");
        const processor = this.outgoingTagValMsgProcessors[menuCommand.commandType];
        return processor?.applyMsg(menuCommand);
    }

    asTagVal(key: string, val: string): string {
        return key + "=" + val + TAG_FIELD_TERMINATOR;
    }

    startMessage(mt: string) {
        return String.fromCharCode(TAG_START_OF_MSG) + String.fromCharCode(PROTOCOL_TAG_VAL) + mt;
    }

    buildJoin(joinCmd: JoinCommand) {
        return this.startMessage(MenuCommandType.JOIN) +
            this.asTagVal(TVMenuFields.KEY_NAME_FIELD, joinCmd.name) +
            this.asTagVal(TVMenuFields.KEY_UUID_FIELD, joinCmd.uuid) +
            this.asTagVal(TVMenuFields.KEY_VER_FIELD, String(joinCmd.version)) +
            this.asTagVal(TVMenuFields.KEY_PLATFORM_ID, joinCmd.platform.toString(10)) +
            String.fromCharCode(TAG_END_OF_MSG);
    }

    buildPairing(pairingCmd: PairingCommand) {
        return this.startMessage(MenuCommandType.PAIRING_REQUEST) +
            this.asTagVal(TVMenuFields.KEY_NAME_FIELD, pairingCmd.appName) +
            this.asTagVal(TVMenuFields.KEY_UUID_FIELD, pairingCmd.appUuid) +
            String.fromCharCode(TAG_END_OF_MSG);

    }

    buildUpdate(changeCmd: ItemChangeCommand) {
        let chg = this.startMessage(MenuCommandType.CHANGE_INT_FIELD) +
            this.asTagVal(TVMenuFields.KEY_CHANGE_TYPE, changeCmd.mode.toFixed(0)) +
            this.asTagVal(TVMenuFields.KEY_ID_FIELD, changeCmd.menuId) +
            this.asTagVal(TVMenuFields.KEY_CORRELATION_FIELD, changeCmd.correlation);
            if(changeCmd.mode === ChangeType.ABSOLUTE_LIST) {
                let l = changeCmd.value as Array<string>;
                this.asTagVal(TVMenuFields.KEY_NO_OF_CHOICES, l.length.toString(10));
                for(let i=0; i<l.length; i++) {
                    let character = String.fromCharCode(65 + i)
                    chg += this.asTagVal(TVMenuFields.KEY_PREPEND_NAMECHOICE + character, "");
                    chg += this.asTagVal(TVMenuFields.KEY_PREPEND_CHOICE + character, l[i]);
                }
            } else {
                chg += this.asTagVal(TVMenuFields.KEY_CURRENT_VAL, changeCmd.value.toString());
            }
            chg += String.fromCharCode(TAG_END_OF_MSG);
            return chg;
    }

    buildDialogAction(dlgCmd: DialogUpdateCommand) {
        return this.startMessage(MenuCommandType.DIALOG_UPDATE) +
            this.asTagVal(TVMenuFields.KEY_MODE_FIELD, dlgCmd.mode) +
            this.asTagVal(TVMenuFields.KEY_HEADER_FIELD, dlgCmd.header) +
            this.asTagVal(TVMenuFields.KEY_BUFFER_FIELD, dlgCmd.buffer) +
            this.asTagVal(TVMenuFields.KEY_BUTTON1_FIELD, dlgCmd.button1.toFixed(0)) +
            this.asTagVal(TVMenuFields.KEY_BUTTON2_FIELD, dlgCmd.button2.toFixed(0)) +
            String.fromCharCode(TAG_END_OF_MSG);
    }

    buildHeartbeat(hb: HeartbeatCommand) {
        return this.startMessage(MenuCommandType.HEARTBEAT) +
            this.asTagVal(TVMenuFields.HB_MODE_FIELD, hb.mode.toString(10)) +
            this.asTagVal(TVMenuFields.HB_FREQUENCY_FIELD, hb.frequency.toString(10)) +
            String.fromCharCode(TAG_END_OF_MSG);
    }

    private processMenuItem<V extends MenuItem<any>>(createMenuItemFn: MenuCtorFunction<V>): V {
        let parser = this.parsedKeyVal;
        let subId = parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD);
        let myId = parser.getValue(TVMenuFields.KEY_ID_FIELD);
        let item = this.tree.getMenuItemFor(myId) as V;
        if(!item) {
            item = createMenuItemFn(parser, myId);
            this.tree.addMenuItem(subId, item);
        }
        item.setVisible(parser.getValueAsInt(TVMenuFields.KEY_VISIBLE_FIELD) !== 0);
        item.setReadOnly(parser.getValueAsInt(TVMenuFields.KEY_READONLY_FIELD) !== 0);
        item.setItemName(parser.getValue(TVMenuFields.KEY_NAME_FIELD))
        return item;
    }

    private processSubMenuItem(parser: TagValProtocolParser): MenuCommand {
        let item = this.processMenuItem((parser, id) => new SubMenuItem(parser.getValue(TVMenuFields.KEY_NAME_FIELD), id));
        return new MenuItemUpdateCommand(MenuCommandType.SUBMENU_BOOT_ITEM, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), false)
    }

    private processActionItem(parser: TagValProtocolParser): MenuCommand {
        let item = this.processMenuItem((parser, id) => new ActionMenuItem(id));
        return new MenuItemUpdateCommand(MenuCommandType.ACTION_BOOT_ITEM, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), false)
    }

    private processRgbItem(parser: TagValProtocolParser): MenuCommand {
        let item = this.processMenuItem((parser, id) => new Rgb32MenuItem(id));
        item.setAlphaChannelOn(parser.getValueAsInt(TVMenuFields.KEY_ALPHA_FIELD)!==0);
        const rgb = parser.getValueWithDefault(TVMenuFields.KEY_CURRENT_VAL, "#ffffff");
        item.setCurrentValue(rgb);
        return new MenuItemUpdateCommand(MenuCommandType.BOOT_RGB_COLOR, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), rgb)
    }

    private processAnalogItem(parser: TagValProtocolParser): MenuCommand {
        let item: AnalogMenuItem = this.processMenuItem<AnalogMenuItem>((parser, id) => new AnalogMenuItem(id));
        item.setOffset(parser.getValueAsInt(TVMenuFields.KEY_ANALOG_OFFSET_FIELD));
        item.setDivisor(parser.getValueAsInt(TVMenuFields.KEY_ANALOG_DIVISOR_FIELD));
        item.setMaxValue(parser.getValueAsInt(TVMenuFields.KEY_ANALOG_MAX_FIELD));
        item.setUnitName(parser.getValueWithDefault(TVMenuFields.KEY_ANALOG_UNIT_FIELD, ""));
        const currentVal = parseInt(parser.getValue(TVMenuFields.KEY_CURRENT_VAL));
        item.setCurrentValue(currentVal);
        return new MenuItemUpdateCommand(MenuCommandType.ANALOG_BOOT_ITEM, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), currentVal);
    }

    private processBooleanItem(parser: TagValProtocolParser): MenuCommand {
        let item: BooleanMenuItem = this.processMenuItem<BooleanMenuItem>((parser, id) => new BooleanMenuItem(id));
        item.setNaming(parser.getValueAsInt(TVMenuFields.KEY_BOOLEAN_NAMING));
        const current = parser.getValue(TVMenuFields.KEY_CURRENT_VAL) === '1';
        item.setCurrentValue(current);
        return new MenuItemUpdateCommand(MenuCommandType.BOOLEAN_BOOT_ITEM, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), current);
    }

    private processFloatItem(parser: TagValProtocolParser): MenuCommand {
        let item: FloatMenuItem = this.processMenuItem<FloatMenuItem>((parser, id) => new FloatMenuItem(id));
        item.setDecimalPlaces(parser.getValueAsInt(TVMenuFields.KEY_FLOAT_DECIMAL_PLACES));
        const current = (parseFloat(parser.getValue(TVMenuFields.KEY_CURRENT_VAL)));
        item.setCurrentValue(current);
        return new MenuItemUpdateCommand(MenuCommandType.FLOAT_BOOT_ITEM, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), current);
    }

    private processScrollChoiceItem(parser: TagValProtocolParser): MenuCommand {
        let item: ScrollChoiceMenuItem = this.processMenuItem<ScrollChoiceMenuItem>((parser, id) => new ScrollChoiceMenuItem(id));
        item.setNumberOfEntries(parser.getValueAsInt(TVMenuFields.KEY_NO_OF_CHOICES));
        const current = (ScrollChoice.fromString(TVMenuFields.KEY_CURRENT_VAL));
        item.setCurrentValue(current);
        return new MenuItemUpdateCommand(MenuCommandType.BOOT_SCROLL_CHOICE, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), current);
    }

    private processTextItem(parser: TagValProtocolParser): MenuCommand {
        let item = this.processMenuItem<EditableTextMenuItem>((parser, id) => new EditableTextMenuItem(id));
        item.setTextLength(parser.getValueAsInt(TVMenuFields.KEY_MAX_LENGTH));
        item.setEditMode(parser.getValueAsInt(TVMenuFields.KEY_EDIT_TYPE));
        const current = (parser.getValueWithDefault(TVMenuFields.KEY_CURRENT_VAL, ""));
        item.setCurrentValue(current);
        return new MenuItemUpdateCommand(MenuCommandType.TEXT_BOOT_ITEM, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), current);
    }

    private processLargeNumItem(parser: TagValProtocolParser): MenuCommand {
        let item = this.processMenuItem<EditableLargeNumberMenuItem>((parser, id) => new EditableLargeNumberMenuItem(id));
        item.setDecimalPlaces(parser.getValueAsInt(TVMenuFields.KEY_FLOAT_DECIMAL_PLACES));
        item.setNegativeAllowed(parser.getValueAsInt(TVMenuFields.KEY_NEGATIVE_ALLOWED) > 0);
        item.setDigitsAllowed(parser.getValueAsInt(TVMenuFields.KEY_MAX_LENGTH));
        const current = (parseFloat(parser.getValueWithDefault(TVMenuFields.KEY_CURRENT_VAL, "0")));
        item.setCurrentValue(current);
        return new MenuItemUpdateCommand(MenuCommandType.LARGE_NUM_BOOT_ITEM, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), current);
    }

    private processListItem(parser: TagValProtocolParser): MenuCommand {
        const item = this.processMenuItem<ListMenuItem>((parser, id) => new ListMenuItem(id));
        const num = parser.getValueAsIntWithDefault(TVMenuFields.KEY_NO_OF_CHOICES, 0);
        const items = listItemHasUpdated(num, parser);
        item.setCurrentValue(items);
        return new MenuItemUpdateCommand(MenuCommandType.RUNTIME_LIST_BOOT, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), items);
    }

    private processEnumItem(parser: TagValProtocolParser): MenuCommand {
        let item: EnumMenuItem = this.processMenuItem<EnumMenuItem>((parser, id) => new EnumMenuItem(id));

        let enumItems = [];
        let noOfItems = parser.getValueAsInt(TVMenuFields.KEY_NO_OF_CHOICES);
        for(let i=0; i<noOfItems; i++) {
            enumItems.push(parser.getValueWithDefault("C" + String.fromCharCode(65 + i), ""));
        }

        item.setItemList(enumItems);
        const current = (parseInt(parser.getValue(TVMenuFields.KEY_CURRENT_VAL)));
        item.setCurrentValue(current);

        return new MenuItemUpdateCommand(MenuCommandType.ENUM_BOOT_ITEM, item, parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD), current);
    }
}

export function toPrintableMessage(rawMessage: string): string {
    let cleanMsg = "";
    for(let i=0; i<rawMessage.length; i++) {
        let charNum = rawMessage.charCodeAt(i);
        if(charNum<31) {
            cleanMsg += "<" + charNum + ">";
        }
        else {
            cleanMsg += rawMessage.charAt(i);
        }
    }
    return cleanMsg;
}

function incomingChangeMessage(p: TagValProtocolParser) {
    const ty = p.getValueAsInt(TVMenuFields.KEY_CHANGE_TYPE);
    const correlation = p.getValueWithDefault("", TVMenuFields.KEY_CORRELATION_FIELD);
    let currentVal = "";
    if(ty === ChangeType.ABSOLUTE_LIST) {
        const items = p.getValueAsIntWithDefault(TVMenuFields.KEY_NO_OF_CHOICES, 0);
        listItemHasUpdated(items, p);
    } else {
        currentVal = p.getValueWithDefault(TVMenuFields.KEY_CURRENT_VAL, "");
    }

    return new ItemChangeCommand(p.getValue(TVMenuFields.KEY_ID_FIELD), ty, currentVal, correlation);
}

function listItemHasUpdated(items: number, parser: TagValProtocolParser): Array<string> {
    let list = Array<string>();
    for(let i=0; i<items; i++) {
        let character = String.fromCharCode(65 + i);
        const name = parser.getValueWithDefault(TVMenuFields.KEY_PREPEND_NAMECHOICE + character, "");
        const value = parser.getValueWithDefault(TVMenuFields.KEY_PREPEND_CHOICE + character, "");
        list.push(name + " " + value);
    }
    return list;
}

function fromTextToDlgMode(value: string): DialogMode {
    return value==='S' ? DialogMode.SHOW : value === 'H' ? DialogMode.HIDE : DialogMode.ACTION;
}
