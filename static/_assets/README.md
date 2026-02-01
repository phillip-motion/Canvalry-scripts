# Assets

> [!IMPORTANT]
> It's recommended to import images (ie. icons) directly into the code. See [import images](../../README.md#import-images) for details.

If your script has assets other than `.png` and `.jpg` images, you should place them inside this `_assets` folder. Any directory ending with `_assets` will be hidden from the `Scripts` menu. Use [`ui.scriptLocation`](https://docs.cavalry.scenegroup.co/tech-info/scripting/script-uis/#scriptlocation--string) to build relative paths.

For example:

```js
const button = new ui.Button('Help')
button.onClick = () => {
	api.openURL(`file://${ui.scriptLocation}/Script_assets/README.html`)
}
```

[Source](https://docs.cavalry.scenegroup.co/tech-info/scripting/script-uis)
