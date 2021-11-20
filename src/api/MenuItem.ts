export class MenuItem<V> {
    messageType: string = 'Undefined';
    private itemName: string = "";
    private menuId: string = "";
    private readOnly: boolean = false;
    private visible: boolean = false;
    private changed: boolean = false;
    private currentValue: V;

    constructor(initialValue: V) {
        this.currentValue = initialValue;
    }

    public isReadOnly(): boolean {
        return this.readOnly;
    }

    public setReadOnly(readOnly: boolean) {
        this.readOnly = readOnly;
        this.markChanged();
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public setVisible(visible: boolean) {
        this.visible = visible;
        this.markChanged();
    }

    public getItemName(): string {
        return this.itemName;
    }

    public setItemName(newName: string) {
        this.itemName = newName;
        this.markChanged();
    }

    public getMenuId(): string {
        return this.menuId;
    }

    public setMenuId(newId: string) {
        this.menuId = newId;
        this.markChanged();
    }

    public markChanged() {
        this.changed = true;
    }

    public clearChanged() {
        this.changed = false;
    }

    public isChanged(): boolean {
        return this.changed;
    }

    public getCurrentValue(): V {
        return this.currentValue;
    }

    public setCurrentValue(newVal: V) {
        this.currentValue = newVal;
        this.markChanged();
    }
}

export class AnalogMenuItem extends MenuItem<number> {
    messageType: string = 'Analog';
    private maxValue: number = 0;
    private divisor: number = 0;
    private offset: number = 0;
    private unitName: string = "";

    public constructor(id: string) {
        super(0);
        this.setMenuId(id);
    }

    public getMaxValue(): number {
        return this.maxValue;
    }

    public setMaxValue(maxVal: number) {
        this.maxValue = maxVal;
        this.markChanged();
    }

    public getDivisor(): number {
        return this.divisor;
    }

    public setDivisor(newDivisor: number) {
        this.divisor = newDivisor;
        this.markChanged();
    }

    public getOffset(): number {
        return this.offset;
    }

    public setOffset(newOffs: number) {
        this.offset = newOffs;
        this.markChanged();
    }

    public getUnitName(): string {
        return this.unitName;
    }

    public setUnitName(unitName: string) {
        this.unitName = unitName;
        this.markChanged();
    }
}

export class EnumMenuItem extends MenuItem<number> {
    messageType: string = 'Enum';
    private itemList: Array<string> = [];

    public constructor(id: string) {
        super(0);
        this.setMenuId(id);
    }

    public getItemList(): Array<string> {
        return this.itemList;
    }

    public setItemList(newList: Array<string>) {
        this.itemList = newList;
        this.markChanged();
    }
}
export class ListMenuItem extends MenuItem<Array<string>> {
    messageType: string = 'List'
    numberOfItems: number = 0;

    public constructor(id: string) {
        super([]);
        this.setMenuId(id);
    }

    setNumberOfItems(items: number): void {
        this.numberOfItems = items;
        this.markChanged();
    }

    getNumberOfItems(): number {
        return this.numberOfItems;
    }
}

export enum BooleanNaming { TRUE_FALSE, ON_OFF, YES_NO}

export class BooleanMenuItem extends MenuItem<boolean> {
    messageType: string = 'Boolean';
    private naming: BooleanNaming = BooleanNaming.TRUE_FALSE;

    public constructor(id: string) {
        super(false);
        this.setMenuId(id);
    }

    public getNaming(): BooleanNaming {
        return this.naming;
    }

    public setNaming(naming: BooleanNaming) {
        this.naming = naming;
        this.markChanged();
    }
}

export class FloatMenuItem extends MenuItem<number> {
    messageType: string = 'Float';
    private decimalPlaces: number = 1;

    public constructor(id: string) {
        super(0.0);
        this.setMenuId(id);
    }

    public getDecimalPlaces(): number {
        return this.decimalPlaces;
    }

    public setDecimalPlaces(decPlaces: number) {
        this.decimalPlaces = decPlaces;
        this.markChanged();
    }
}

export class ActionMenuItem extends MenuItem<boolean> {
    messageType: string = "Action";

    public constructor(id: string) {
        super(false);
        this.setMenuId(id);
    }
}

export class SubMenuItem extends MenuItem<boolean> {
    messageType: string = 'Sub';
    private children: Array<MenuItem<any>> = [];

    public constructor(name: string, id: string) {
        super(false);
        this.setItemName(name);
        this.setMenuId(id);
        this.setReadOnly(false);
        this.setVisible(true);
        this.clearChanged();
    }


    public getChildren(): Array<MenuItem<any>> {
        return this.children;
    }

    public addChildItem(item: MenuItem<any>) {
        this.children.push(item);
        this.markChanged();
    }

    clearAll() {
        this.children = [];
        this.markChanged();
    }
}

export class EditableLargeNumberMenuItem extends MenuItem<number> {
    public messageType: string = "LargeNum";
    private digitsAllowed: number = 8;
    private decimalPlaces: number = 3;
    private negativeAllowed: boolean = false;

    constructor(id: string) {
        super(0.0);
        this.setMenuId(id);
    }

    getDigitsAllowed(): number {
        return this.digitsAllowed;
    }

    setDigitsAllowed(allowed: number): void {
        this.digitsAllowed = allowed;
        this.markChanged();
    }

    getDecimalPlaces(): number {
        return this.decimalPlaces;
    }

    setDecimalPlaces(places: number): void {
        this.decimalPlaces = places;
        this.markChanged();
    }

    isNegativeAllowed(): boolean {
        return this.negativeAllowed;
    }

    setNegativeAllowed(neg: boolean): void {
        this.negativeAllowed = neg;
        this.markChanged();
    }
}

export class Rgb32MenuItem extends MenuItem<string> {
    public messageType: string = "Rgb32";
    private alphaChannelOn: boolean = false;

    constructor(id: string) {
        super("#ffffff");
        this.setMenuId(id);
    }

    isAlphaChannelOn(): boolean {
        return this.alphaChannelOn;
    }

    setAlphaChannelOn(on: boolean) {
        this.alphaChannelOn = on;
        this.markChanged();
    }
}

export class ScrollChoice {
    public currentPos: number = 0;
    public currentValue: string = "";

    constructor(pos: number, text: string) {
        this.currentPos = pos;
        this.currentValue = text;
    }

    static fromString(val: string): ScrollChoice {
        let data = val?.split(":");
        if(data?.length === 2) {
            return new ScrollChoice(parseInt(data[0]), data[1]);
        } else {
            return new ScrollChoice(0, "");
        }
    }

    asString(): string {
        return this.currentPos + "-" + this.currentValue;
    }
}

export class ScrollChoiceMenuItem extends MenuItem<ScrollChoice> {
    public messageType: string = "Scroll";
    private numberOfEntries: number = 0;

    constructor(id: string) {
        super(new ScrollChoice(0, ""));
        this.setMenuId(id);
    }

    setNumberOfEntries(entries: number) {
        this.numberOfEntries = entries;
        this.markChanged();
    }

    getNumberOfEntries(): number {
        return this.numberOfEntries;
    }
}

export enum TextEditMode {
    PLAIN_TEXT, IP_ADDRESS, TIME_24H, TIME_12H, TIME_24_HUNDREDS, GREGORIAN_DATE,
    TIME_DURATION_SECONDS, TIME_DURATION_HUNDREDS, TIME_24H_HHMM, TIME_12H_HHMM
}

export class EditableTextMenuItem extends MenuItem<string> {
    public messageType: string = "Text";
    private editMode: TextEditMode = TextEditMode.PLAIN_TEXT;
    private textLength: number = 10;

    constructor(id: string) {
        super("");
        this.setMenuId(id);
    }

    getTextLength(): number {
        return this.textLength;
    }

    setTextLength(len: number): void {
        this.textLength = len;
        this.markChanged();
    }

    getEditMode(): TextEditMode {
        return this.editMode;
    }

    setEditMode(mode: TextEditMode): void {
        this.editMode = mode;
        this.markChanged();
    }
}