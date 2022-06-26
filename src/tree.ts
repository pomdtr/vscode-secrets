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

export interface Folder {
  name: string;
  enabled: boolean;
  secrets: Secret[];
}

export interface Secret {
  key: string;
  folder: string;
}

export interface Category {
  name: string;
  expanded: boolean;
  children: Secret[] | Folder[];
}

type Node = Secret | Category | Folder;

export class VaultTreeDataProvider implements TreeDataProvider<Node> {
  vault: Vault;

  private _onDidChangeTreeData: EventEmitter<Node | undefined | null | void> =
    new EventEmitter();
  readonly onDidChangeTreeData: Event<Node | undefined | null | void> =
    this._onDidChangeTreeData.event;

  static register(context: ExtensionContext, vault: Vault) {
    const tree = new VaultTreeDataProvider(vault);
    return context.subscriptions.push(
      window.registerTreeDataProvider("secretsExplorer", tree)
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

  isFolder(item: Node): item is Folder {
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
    } else if (this.isFolder(item)) {
      return {
        label: item.name,
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        description: item.enabled ? "Enabled" : "Disabled",
        iconPath: new ThemeIcon("folder"),
        contextValue: item.enabled ? "enabled-folder" : "disabled-folder",
      };
    } else {
      return {
        label: item.key,
        iconPath: new ThemeIcon("key"),
        tooltip: this.vault.get(item),
        description: item.folder,
        contextValue: "secret",
      };
    }
  }

  getChildren(item?: Category | Folder): ProviderResult<Node[]> {
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
        name: "Folders",
        children: this.vault.listFolders(),
        expanded: false,
      },
    ];
  }
}
