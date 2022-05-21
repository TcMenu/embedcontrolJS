import {MenuItem, SubMenuItem} from "./MenuItem";

type TreeStructureChangedFn = (menuTree: MenuTree, id: string) => void;

export class MenuTree {
    private allItemMap: { [id: string]: MenuItem<any>; } = {};
    private readonly rootElement = new SubMenuItem("ROOT", "0");
    private treeStructureChanged: TreeStructureChangedFn;

    constructor(treeStructChangeFn: TreeStructureChangedFn) {
        this.allItemMap["0"] = this.rootElement;
        this.treeStructureChanged = treeStructChangeFn;
    }

    public getRoot() {
        return this.rootElement;
    }

    public getMenuItemFor(key: string): MenuItem<any> {
        return this.allItemMap[key];
    }

    public addMenuItem(subMenuId: string, menuItem: MenuItem<any>): boolean {
        if(!this.getMenuItemFor(menuItem.getMenuId())) {
            let sub = this.allItemMap[subMenuId] as SubMenuItem;
            if (!sub) sub = this.rootElement;
            sub.addChildItem(menuItem);
            this.allItemMap[menuItem.getMenuId()] = menuItem;
            this.treeStructureChanged(this, menuItem.getMenuId());
            return true;
        }
        else return false; // already existed so not re-added.
    }

    emptyTree() {
        this.allItemMap = {};
        this.rootElement.clearAll();
        this.allItemMap["0"] = this.rootElement;
        this.treeStructureChanged(this, this.rootElement.getMenuId());
    }
}