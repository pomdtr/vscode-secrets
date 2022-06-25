# Visual Studio Code Secret

Define secrets shared accross workspace, injected as environment variables.

## Usage

Use the secrets tree view to manage your secrets.

## Groups

If you want associate multiple values to the same environment variable (ex: `GITHUB_TOKEN`), you can use set it in two different groups.

Use to the `secrets.enabledGroups` pref to specify which group to use in you current workspace.

```javascript
{
    // Both the default and github groups will be loaded in this workspace
    "secrets.enabledGroups": [
        "default",
        "github"
    ]
}
```
