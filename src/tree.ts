import {
  TreeDataProvider,
  TreeItem,
  ProviderResult,
  Event,
  EventEmitter,
  ExtensionContext,
  window,
  ThemeIcon,
  TreeItemCollapsibleState,
} from "vscode";
import { Vault } from "./vault";

export interface Group {
  name: string;
  enabled: boolean;
  secrets: Secret[];
}

export interface Secret {
  key: string;
  group: string;
}

export interface Category {
  name: string;
  expanded: boolean;
  children: Secret[] | Group[];
}

type Node = Secret | Category | Group;

export class VaultTreeDataProvider implements TreeDataProvider<Node> {
  vault: Vault;

  private _onDidChangeTreeData: EventEmitter<Node | undefined | null | void> =
    new EventEmitter();
  readonly onDidChangeTreeData: Event<Node | undefined | null | void> =
    this._onDidChangeTreeData.event;

  static register(context: ExtensionContext, vault: Vault) {
    const tree = new VaultTreeDataProvider(vault);
    return context.subscriptions.push(
      window.registerTreeDataProvider("secretExplorer", tree)
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  constructor(vault: Vault) {
    this.vault = vault;
    vault.onChange(() => this.refresh());
  }

  isCategory(item: Node): item is Category {
    return item.hasOwnProperty("children");
  }

  isGroup(item: Node): item is Group {
    return item.hasOwnProperty("secrets");
  }

  getTreeItem(item: Node): TreeItem {
    if (this.isCategory(item)) {
      return {
        label: item.name,
        collapsibleState: item.expanded
          ? TreeItemCollapsibleState.Expanded
          : TreeItemCollapsibleState.Collapsed,
        contextValue: `category-${item.name.toLowerCase()}`,
      };
    } else if (this.isGroup(item)) {
      return {
        label: item.name,
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        description: item.enabled ? "Enabled" : "Disabled",
        contextValue: item.enabled ? "enabled-group" : "disabled-group",
      };
    } else {
      return {
        label: item.key,
        iconPath: new ThemeIcon("key"),
        tooltip: this.vault.get(item),
        description: item.group,
        contextValue: "secret",
      };
    }
  }

  getChildren(item?: Category | Group): ProviderResult<Node[]> {
    if (item) {
      return this.isCategory(item) ? item.children : item.secrets;
    }
    return [
      {
        name: "Active Secrets",
        children: Object.values(this.vault.getActiveSecrets()),
        expanded: true,
      },
      {
        name: "Groups",
        children: this.vault.listGroups(),
        expanded: false,
      },
    ];
  }
}
