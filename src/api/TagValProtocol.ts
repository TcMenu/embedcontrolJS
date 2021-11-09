import {
    ActionMenuItem,
    AnalogMenuItem,
    BooleanMenuItem, EditableTextMenuItem,
    EnumMenuItem,
    FloatMenuItem,
    MenuItem, Rgb32MenuItem, ScrollChoice, ScrollChoiceMenuItem,
    SubMenuItem
} from "./MenuItem";
import {MenuController} from "./MenuController";
import {HeartbeatMode, MenuCommandType, TVMenuFields} from "./TagValEnums";

export const PROTOCOL_TAG_VAL = 0x01;
export const TAG_START_OF_MSG = 0x01;
export const TAG_END_OF_MSG = 0x02;
const TAG_FIELD_TERMINATOR = '|';

export class TcProtocolError extends Error {
    public static UNEXPECTED_EOM: string = "Unexpected End Of Message";
    public static KEY_NOT_DEF: string = "Key not defined: ";
    public static MSG_TOO_SMALL: string = "Message too small: ";

    constructor(public message: string) {
        super(message);
        this.name = "TcProtocolError";
        ({stack: this.stack} = (<any>new Error()));
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

type MenuCtorFunction<V extends MenuItem<any>> = (parser: TagValProtocolParser, id: string) => V;

export class TagValProtocolHandler {
    private controller: MenuController;
    private parsedKeyVal: TagValProtocolParser

    public constructor(controller: MenuController) {
        this.controller = controller;
        this.parsedKeyVal = new TagValProtocolParser();
    }

    public tagValToMenuItem(tagValStr: string) {
        if (tagValStr.length < 3) throw new TcProtocolError(TcProtocolError.MSG_TOO_SMALL + tagValStr);
        let msgType = tagValStr.substr(0, 2);
        let restOfMsg = tagValStr.substr(2);
        let parser = this.parsedKeyVal;
        parser.startParseData(restOfMsg);
        this.controller.registerReceivedMessage();
        switch (msgType) {
            case MenuCommandType.HEARTBEAT:
                this.controller.heartbeatReceived(
                    parser.getValueAsInt(TVMenuFields.HB_MODE_FIELD),
                    parser.getValueAsIntWithDefault(TVMenuFields.HB_FREQUENCY_FIELD, 1500)
                );
                break;
            case MenuCommandType.BOOTSTRAP:
                this.controller.bootstrapEvent(parser.getValue(TVMenuFields.KEY_BOOT_TYPE_FIELD))
                break;
            case MenuCommandType.ACKNOWLEDGEMENT:
                this.controller.acknowledgement(parser.getValue(TVMenuFields.KEY_CORRELATION_FIELD));
                break;
            case MenuCommandType.JOIN:
                this.controller.joinReceived(
                    parser.getValue(TVMenuFields.KEY_NAME_FIELD),
                    parser.getValue(TVMenuFields.KEY_UUID_FIELD),
                    parser.getValue(TVMenuFields.KEY_PLATFORM_ID),
                    parseFloat(parser.getValue(TVMenuFields.KEY_VER_FIELD)) / 100.0,
                );
                break;
            case MenuCommandType.CHANGE_INT_FIELD:
                this.controller.itemHasUpdated(
                    parser.getValue(TVMenuFields.KEY_ID_FIELD),
                    parser.getValue(TVMenuFields.KEY_CURRENT_VAL));
                break;
            case MenuCommandType.PAIRING_REQUEST:
                this.controller.pairingRequest(parser.getValue(TVMenuFields.KEY_NAME_FIELD), parser.getValue(TVMenuFields.KEY_UUID_FIELD))
                break;
            case MenuCommandType.SUBMENU_BOOT_ITEM:
                this.processSubMenuItem();
                break;
            case MenuCommandType.ANALOG_BOOT_ITEM:
                this.processAnalogItem();
                break;
            case MenuCommandType.BOOLEAN_BOOT_ITEM:
                this.processBooleanItem();
                break;
            case MenuCommandType.FLOAT_BOOT_ITEM:
                this.processFloatItem();
                break;
            case MenuCommandType.ENUM_BOOT_ITEM:
                this.processEnumItem();
                break;
            case MenuCommandType.ACTION_BOOT_ITEM:
                this.processActionItem();
                break;
            case MenuCommandType.BOOT_RGB_COLOR:
                this.processRgbItem();
                break;
            case MenuCommandType.BOOT_SCROLL_CHOICE:
                this.processScrollChoiceItem();
                break;
            case MenuCommandType.TEXT_BOOT_ITEM:
                this.processTextItem();
                break;
            default:
                this.controller.unhandledMsg(tagValStr, parser);
                break;
        }
    }

    asTagVal(key: string, val: string): string {
        return key + "=" + val + TAG_FIELD_TERMINATOR;
    }

    startMessage(mt: string) {
        return String.fromCharCode(TAG_START_OF_MSG) + String.fromCharCode(PROTOCOL_TAG_VAL) + mt;
    }

    buildJoin(name: string, uuid: string) {
        return this.startMessage(MenuCommandType.JOIN) +
            this.asTagVal(TVMenuFields.KEY_NAME_FIELD, name) +
            this.asTagVal(TVMenuFields.KEY_UUID_FIELD, uuid) +
            this.asTagVal(TVMenuFields.KEY_VER_FIELD, "1") +
            this.asTagVal(TVMenuFields.KEY_PLATFORM_ID, "1") +
            String.fromCharCode(TAG_END_OF_MSG);
    }

    buildDeltaUpdate(item: AnalogMenuItem | EnumMenuItem, amount: number): string {
        return this.startMessage(MenuCommandType.CHANGE_INT_FIELD) +
            this.asTagVal(TVMenuFields.KEY_CHANGE_TYPE, "0") +
            this.asTagVal(TVMenuFields.KEY_ID_FIELD, item.getMenuId()) +
            this.asTagVal(TVMenuFields.KEY_CURRENT_VAL, amount.toString(10)) +
            String.fromCharCode(TAG_END_OF_MSG);
    }

    buildAbsoluteUpdate(item: MenuItem<any>, newValue: string, isList: boolean): string {
        return this.startMessage(MenuCommandType.CHANGE_INT_FIELD) +
            this.asTagVal(TVMenuFields.KEY_CHANGE_TYPE, (isList) ? "2" : "1") +
            this.asTagVal(TVMenuFields.KEY_ID_FIELD, item.getMenuId()) +
            this.asTagVal(TVMenuFields.KEY_CURRENT_VAL, newValue) +
            String.fromCharCode(TAG_END_OF_MSG);
    }

    buildHeartbeat(hbMode: HeartbeatMode) {
        return this.startMessage(MenuCommandType.HEARTBEAT) +
            this.asTagVal(TVMenuFields.HB_MODE_FIELD, hbMode.toString(10)) +
            this.asTagVal(TVMenuFields.HB_FREQUENCY_FIELD, "1500") +
            String.fromCharCode(TAG_END_OF_MSG);
    }

    private processMenuItem<V extends MenuItem<any>>(createMenuItemFn: MenuCtorFunction<V>): V {
        let parser = this.parsedKeyVal;
        let subId = parser.getValue(TVMenuFields.KEY_PARENT_ID_FIELD);
        let myId = parser.getValue(TVMenuFields.KEY_ID_FIELD);
        let item = this.controller.getTree().getMenuItemFor(myId) as V;
        if(!item) {
            item = createMenuItemFn(parser, myId);
            this.controller.getTree().addMenuItem(subId, item);
        }
        item.setVisible(parser.getValueAsInt(TVMenuFields.KEY_VISIBLE_FIELD) !== 0);
        item.setReadOnly(parser.getValueAsInt(TVMenuFields.KEY_READONLY_FIELD) !== 0);
        item.setItemName(parser.getValue(TVMenuFields.KEY_NAME_FIELD))
        return item;
    }

    private processSubMenuItem() {
        let item = this.processMenuItem((parser, id) => new SubMenuItem(parser.getValue(TVMenuFields.KEY_NAME_FIELD), id));
        this.controller.getTree().menuItemUpdated(item.getMenuId());
    }

    private processActionItem() {
        let item = this.processMenuItem((parser, id) => new ActionMenuItem(id));
        this.controller.getTree().menuItemUpdated(item.getMenuId());
    }

    private processRgbItem() {
        let parser = this.parsedKeyVal;
        let item = this.processMenuItem((parser, id) => new Rgb32MenuItem(id));
        item.setAlphaChannelOn(parser.getValueAsInt(TVMenuFields.KEY_ALPHA_FIELD)!==0);
        this.controller.getTree().menuItemUpdated(item.getMenuId());
    }

    private processAnalogItem() {
        let parser = this.parsedKeyVal;
        let item: AnalogMenuItem = this.processMenuItem<AnalogMenuItem>((parser, id) => new AnalogMenuItem(id));
        item.setOffset(parser.getValueAsInt(TVMenuFields.KEY_ANALOG_OFFSET_FIELD));
        item.setDivisor(parser.getValueAsInt(TVMenuFields.KEY_ANALOG_DIVISOR_FIELD));
        item.setMaxValue(parser.getValueAsInt(TVMenuFields.KEY_ANALOG_MAX_FIELD));
        item.setUnitName(parser.getValue(TVMenuFields.KEY_ANALOG_UNIT_FIELD));
        item.setCurrentValue(parseInt(parser.getValue(TVMenuFields.KEY_CURRENT_VAL)));
        this.controller.getTree().menuItemUpdated(item.getMenuId());
    }

    private processBooleanItem() {
        let parser = this.parsedKeyVal;
        let item: BooleanMenuItem = this.processMenuItem<BooleanMenuItem>((parser, id) => new BooleanMenuItem(id));
        item.setNaming(parser.getValueAsInt(TVMenuFields.KEY_BOOLEAN_NAMING));
        item.setCurrentValue(parser.getValue(TVMenuFields.KEY_CURRENT_VAL) === '1');
        this.controller.getTree().menuItemUpdated(item.getMenuId());
    }

    private processFloatItem() {
        let parser = this.parsedKeyVal;
        let item: FloatMenuItem = this.processMenuItem<FloatMenuItem>((parser, id) => new FloatMenuItem(id));
        item.setDecimalPlaces(parser.getValueAsInt(TVMenuFields.KEY_FLOAT_DECIMAL_PLACES));
        item.setCurrentValue(parseFloat(parser.getValue(TVMenuFields.KEY_CURRENT_VAL)));
        this.controller.getTree().menuItemUpdated(item.getMenuId());
    }

    private processScrollChoiceItem() {
        let parser = this.parsedKeyVal;
        let item: ScrollChoiceMenuItem = this.processMenuItem<ScrollChoiceMenuItem>((parser, id) => new ScrollChoiceMenuItem(id));
        item.setNumberOfEntries(parser.getValueAsInt(TVMenuFields.KEY_NO_OF_CHOICES));
        item.setCurrentValue(ScrollChoice.fromString(TVMenuFields.KEY_CURRENT_VAL));
        this.controller.getTree().menuItemUpdated(item.getMenuId());
    }

    private processTextItem() {
        let parser = this.parsedKeyVal;
        let item: EditableTextMenuItem = this.processMenuItem<EditableTextMenuItem>((parser, id) => new EditableTextMenuItem(id));
        item.setTextLength(parser.getValueAsInt(TVMenuFields.KEY_MAX_LENGTH));
        item.setEditMode(parser.getValueAsInt(TVMenuFields.KEY_EDIT_TYPE));
        item.setCurrentValue(parser.getValue(TVMenuFields.KEY_CURRENT_VAL));
        this.controller.getTree().menuItemUpdated(item.getMenuId());
    }

    private processEnumItem() {
        let parser = this.parsedKeyVal;
        let item: EnumMenuItem = this.processMenuItem<EnumMenuItem>((parser, id) => new EnumMenuItem(id));

        let enumItems = [];
        let noOfItems = parser.getValueAsInt(TVMenuFields.KEY_NO_OF_CHOICES);
        for(let i=0; i<noOfItems; i++) {
            enumItems.push(parser.getValueWithDefault("C" + String.fromCharCode(65 + i), ""));
        }

        item.setItemList(enumItems);
        item.setCurrentValue(parseInt(parser.getValue(TVMenuFields.KEY_CURRENT_VAL)));
        this.controller.getTree().menuItemUpdated(item.getMenuId());
    }
}

export function toPrintableMessage(rawMessage: string): string {
    let cleanMsg = "";
    for(let i=0; i<rawMessage.length; i++) {
        var charNum = rawMessage.charCodeAt(i);
        if(charNum<31) {
            cleanMsg += "<" + charNum + ">";
        }
        else {
            cleanMsg += rawMessage;
        }
    }
    return cleanMsg;
}
