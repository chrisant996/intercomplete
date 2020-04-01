# TODO

* The horizontal scrollbar overlays the peek, which is kind of terrible.
* Build a modal solution, maybe using an input box.

## BUGS

> Inline mode gets confused by concurrent async commands!

> Dismiss intellisense popups if possible!

* Scrolling moves the peek -- should hide and show.
* Make the peek use more lines so it isn't obscured by the horizontal scrollbar.

## FEATURES

## PUNT

* Is there a way to put borders on the inline mode decorations? `Nope.`

---

## OTHER

### Explore the API

* You can open the full set of our API when you open the file `node_modules/@types/vscode/index.d.ts`.

### Run tests

* Open the debug viewlet (`Ctrl+Shift+D` or `Cmd+Shift+D` on Mac) and from the launch configuration dropdown pick `Extension Tests`.
* Press `F5` to run the tests in a new window with your extension loaded.
* See the output of the test result in the debug console.
* Make changes to `src/test/suite/extension.test.ts` or create new test files inside the `test/suite` folder.
  * The provided test runner will only consider files matching the name pattern `**.test.ts`.
  * You can create folders inside the `test` folder to structure your tests any way you want.

### Go further

 * Reduce the extension size and improve the startup time by [bundling your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
 * [Publish your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) on the VSCode extension marketplace.
 * Automate builds by setting up [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).
