import {
    AnalogMenuItem,
    BooleanMenuItem,
    BooleanNaming,
    EditableLargeNumberMenuItem,
    EditableTextMenuItem,
    EnumMenuItem,
    FloatMenuItem,
    MenuItem,
    Rgb32MenuItem,
    ScrollChoiceMenuItem, TextEditMode
} from "./MenuItem";

export function formatToWire(item: MenuItem<any>): string|undefined {
    if(item instanceof AnalogMenuItem) return item.getCurrentValue().toFixed(0);
    else if(item instanceof EnumMenuItem) return item.getCurrentValue().toFixed(0);
    else if(item instanceof FloatMenuItem) return item.getCurrentValue().toFixed(item.getDecimalPlaces());
    else if(item instanceof BooleanMenuItem) return item.getCurrentValue() ? "1" : "0";
    else if(item instanceof EditableLargeNumberMenuItem) return item.getCurrentValue().toFixed(item.getDecimalPlaces());
    else if(item instanceof EditableTextMenuItem) return formatEditableTextWire(item);
    else if(item instanceof Rgb32MenuItem) return item.getCurrentValue();
    else if(item instanceof ScrollChoiceMenuItem) return item.getCurrentValue().currentPos.toFixed(0);
    else return undefined;
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

function formatEditableTextWire(et: EditableTextMenuItem)  {
    let text = et.getCurrentValue();
    if(et.getEditMode() === TextEditMode.PLAIN_TEXT && text.length < et.getTextLength())
    {
        return text;
    }
    else if(et.getEditMode() === TextEditMode.IP_ADDRESS)
    {
        if (!text.match("\\d+\\.\\d+\\.\\d+\\.\\d+")) return "0.0.0.0";
        return text;
    }
    else if(et.getEditMode() === TextEditMode.TIME_24H || et.getEditMode() === TextEditMode.TIME_24_HUNDREDS || et.getEditMode() === TextEditMode.TIME_12H)
    {
        // time is always sent back to the server in 24 hour format, it is always possible (but optional) to provide hundreds/sec.
        if (!text.match("\\d+:\\d+:\\d+(.\\d*)*")) return "12:00:00";
        return text;
    }
    else if (et.getEditMode() === TextEditMode.GREGORIAN_DATE)
    {
        if (!text.match("\\d+/\\d+/\\d+")) return "01/01/2000";
        return text;
    }
    return "";
}
