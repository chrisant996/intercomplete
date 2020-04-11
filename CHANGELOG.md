# Change Log

All notable changes to the "intercomplete" extension will be documented in this file.

- Format based on [Keep a Changelog](https://keepachangelog.com/).
- Follows [Semantic Versioning](https://semver.org/).

## 0.2.0

### Changed

- Improved performance slightly, but discovered the slowness was really due to another extension -- updated README.md accordingly.
- Make the borders less harsh, and only use a bottom border.

### Fixed

- Fixed to not create undo operations when the text to be inserted matches what's already there.

## [0.1.2](https://github.com/chrisant996/intercomplete/tree/4d8159572d73fd78803f725a45e6e3e2014fa826)

### Initial Release

- `Ctrl+Shift+,` invokes `intercomplete.prevInterComplete` to choose a completion candidate earlier in the document.
- `Ctrl+Shift+.` invokes `intercomplete.nextInterComplete` to choose a completion candidate later in the document.
- `Ctrl+Shift+Space` during an interactive completion invokes `intercomplete.moreInterComplete` to insert more from the chosen completion candidate.
- `Escape` during an interactive completion ends the completion.
- The `intercomplete.feedbackMode` setting chooses "decoration" or "status bar" as the way to show feedback about the current completion candidate.
