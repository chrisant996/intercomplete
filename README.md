# InterComplete [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This extension provides fast and streamlined interactive completion based on lines that contain matches for the word to the left of the editing cursor.  It's modeled after similar functionality in SlickEdit.

## How To Use

### Short version
* Press "next/prev" keys to choose a completion candidate (based on the word to the left of the editing cursor).
* Press a "more" key to insert more of the text from the chosen completion candidate.
* When you're done, you don't even have to do anything special -- just do whatever else you were going to do next.

### Step by step

1. Press the "next/prev" keys to start a new interactive completion if one isn't already active.
   * It searches for completion candidates by matching the word to the left of the editing cursor.
   * Starting from the match, the rest of the matching line is the "completion candidate".
   * `Ctrl+Shift+,` looks for previous candidates (earlier in the document).
   * `Ctrl+Shift+.` looks for next candidates (later in the document).
2. The extension shows feedback at the bottom of the window to indicate the current completion candidate (see [Settings](#settings) for the available feedback modes).
3. Press the "next/prev" keys repeatedly until you've got the completion candidate you want.
4. Press the "more" key to insert more of the completion candidate.
   * `Ctrl+Shift+Space` inserts up to the end of the next word in the completion candidate.
   * You can insert as much or as little as you want, up to the end of the candidate's line.
   * You can change your mind and choose a different completion candidate by pressing the "next/prev" keys again, even after having pressed the "more" key.
5. When you're done, just start doing something else (or press the `Escape` key to explicitly end the interactive completion).

## Settings

* `intercomplete.feedbackMode`: string enum (see [known issues](#known-issues))
  * "decoration" -- (_default_) Shows feedback for the current completion using a text decoration at the bottom of the window.
  * "status bar" -- Shows feedback for the current completion in the status bar.

## Known Issues

Visit [issues](https://github.com/chrisant996/intercomplete/issues) for more information.

* **The feedback modes aren't awesome.**  Yeah.  Unfortunately VSCode is very limited in how an extension can provide feedback to the user.
  * "decoration" mode can have cosmetic side effects; it forces a horizontal scrollbar to appear, and it can potentially encounter some flicker or jitter.  If you experience issues or it's just annoying, try changing to the "status bar" feedback mode via Settings.
  * "status bar" mode can overly subtle, and it can potentially encounter jitter or interference with other status bar items.
  * Know of other approaches?  Visit [issues][issues] and share implementation details or share the name of an extension that uses another approach.
* **Fast repeated command invocations might get ignored.**  Yeah.  For some reason, VSCode allows commands to run concurrently, so holding down a keybinding can garble the results if the previous command invocation(s) haven't finished before the next command invocation starts.  InterComplete compensates for that flaw, but it does so by making the new command invocation do nothing, so if you invoke a command 3 times quickly, it's possible that only 1 or 2 keypresses might actually take effect.  It looks like a bug (or design issue) inside VSCode, and I'm still looking for better workarounds.  I'll log an issue against VSCode when I finish getting the analysis and repro packaged up nicely.

## Release Notes

See [CHANGELOG](CHANGELOG.md).

## Credits

I learned a lot of applicable techniques from these extensions.

* [jomeinaster.bracket-peek](https://github.com/j0meinaster/bracket-peek) by j0meinaster.
* [siegebell.incremental-search](https://github.com/siegebell/vsc-incremental-search) by siegebell.
* [another-word-completion](https://www.github.com/getogrand/another-word-completion) by getogrand.

[issues]: <https://github.com/chrisant996/intercomplete/issues>