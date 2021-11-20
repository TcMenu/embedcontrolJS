import {
    AnalogMenuItem,
    BooleanMenuItem,
    BooleanNaming,
    EditableLargeNumberMenuItem,
    EditableTextMenuItem,
    EnumMenuItem,
    FloatMenuItem, ListMenuItem,
    MenuItem,
    Rgb32MenuItem,
    ScrollChoiceMenuItem, TextEditMode
} from "./MenuItem";
import {TcProtocolError} from "./TagValProtocol";

function isTrue(currentValue: string): boolean {
    return currentValue.charAt(0) === "Y" || currentValue.charAt(0) === "1" || currentValue.charAt(0) === "T";
}

export function formatStringToWire(item: MenuItem<any>, currentValue: string): string {
    if(item instanceof AnalogMenuItem) {
        let num = parseFloat(currentValue);
        num = Math.round((num * item.getDivisor()) - item.getOffset());
        if(num < 0 || num > item.getMaxValue()) throw new TcProtocolError(`Number ${num} outside of 0..${item.getMaxValue()}`);
        return num.toFixed(0);
    }
    else if(item instanceof EnumMenuItem) {
        let num = parseInt(currentValue);
        if(num < 0 || num >= item.getItemList().length) throw new TcProtocolError(`Enum ${num} outside allowable range`);
        return item.getCurrentValue().toFixed(0);
    }
    else if(item instanceof BooleanMenuItem) return isTrue(currentValue) ? "1" : "0";
    else if(item instanceof EditableLargeNumberMenuItem) {
        let flt = parseFloat(currentValue);
        if(flt < 0 && !item.isNegativeAllowed()) throw new TcProtocolError("Negative value not allowed");
        return flt.toFixed(item.getDecimalPlaces());
    }
    else if(item instanceof EditableTextMenuItem) {
        return formatEditableTextWire(item, currentValue);
    }
    else if(item instanceof Rgb32MenuItem) {
        if(!currentValue.match("#[0-9A-Fa-f]*")) throw new TcProtocolError("Not in HTML color format");
        return currentValue;
    }
    else if(item instanceof ScrollChoiceMenuItem)  {
        let num = parseInt(currentValue);
        return num.toFixed(0) + "-";
    }
    else throw new TcProtocolError("Unknown type of item for text conversion");
}

export function formatForDisplay(item: MenuItem<any>): string {
    if(item instanceof FloatMenuItem) return item.getCurrentValue().toFixed(item.getDecimalPlaces());
    else if(item instanceof AnalogMenuItem) return formatAnalogItem(item);
    else if(item instanceof EnumMenuItem) return item.getItemList()[item.getCurrentValue()];
    else if(item instanceof BooleanMenuItem) return formatBooleanItem(item);
    else if(item instanceof EditableTextMenuItem) return item.getCurrentValue();
    else if(item instanceof EditableLargeNumberMenuItem) return item.getCurrentValue().toFixed(item.getDecimalPlaces());
    else if(item instanceof Rgb32MenuItem) return item.getCurrentValue();
    else if(item instanceof ScrollChoiceMenuItem) return item.getCurrentValue().currentValue;
    else if(item instanceof ListMenuItem) return Object.values(item.getCurrentValue()).join(", ");
    else return "";
}

function formatBooleanItem(item: BooleanMenuItem) {
    let curr = item.getCurrentValue();
    switch(item.getNaming()) {
        case BooleanNaming.YES_NO: return curr ? "YES" : "NO";
        case BooleanNaming.ON_OFF: return curr ? "ON" : "OFF";
        default: return curr ? "TRUE" : "FALSE";
    }
}

function getActualDecimalDivisor(divisor: number): number {
    if (divisor < 2) return 1;
    return (divisor > 1000) ? 10000 : (divisor > 100) ? 1000 : (divisor > 10) ? 100 : 10;
}

function calculateRequiredDigits(divisor: number) {
    return (divisor <= 10) ? 1 : (divisor <= 100) ? 2 : (divisor <= 1000) ? 3 : 4;
}

function formatAnalogItem(an: AnalogMenuItem) {
    let calcVal = an.getCurrentValue() + an.getOffset();
    let divisor = an.getDivisor();

    if (divisor < 2)  {
        return calcVal.toFixed(0);
    } else {
        let whole = Math.floor(calcVal / divisor);
        let fractMax = getActualDecimalDivisor(an.getDivisor());
        let fraction = (Math.abs((calcVal % divisor)) * (fractMax / divisor)).toFixed(0);
        return whole.toFixed(0) + "." + fraction.padStart(calculateRequiredDigits(divisor), "0") + an.getUnitName();
    }
}

function formatEditableTextWire(et: EditableTextMenuItem, val: string)  {
    if(et.getEditMode() === TextEditMode.PLAIN_TEXT) {
        if(val.length > et.getTextLength()) throw new TcProtocolError("Text too long");
        return val;
    }
    else if(et.getEditMode() === TextEditMode.IP_ADDRESS)
    {
        if (!val.match("\\d+\\.\\d+\\.\\d+\\.\\d+")) throw new TcProtocolError("Not an IPV4 address");
        return val;
    }
    else if(et.getEditMode() === TextEditMode.TIME_24H || et.getEditMode() === TextEditMode.TIME_24_HUNDREDS || et.getEditMode() === TextEditMode.TIME_12H)
    {
        // time is always sent back to the server in 24 hour format, it is always possible (but optional) to provide hundreds/sec.
        if (!val.match("\\d+:\\d+:\\d+(.\\d*)*")) throw new TcProtocolError("Not in the correct time format");
        return val;
    }
    else if (et.getEditMode() === TextEditMode.GREGORIAN_DATE)
    {
        if (!val.match("\\d+/\\d+/\\d+")) throw new TcProtocolError("Not a date");
        return val;
    }
    return "";
}
