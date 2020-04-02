# Change Log

All notable changes to the "intercomplete" extension will be documented in this file.

- Format based on [Keep a Changelog](https://keepachangelog.com/).
- Follows [Semantic Versioning](https://semver.org/).

## [0.1.0](https://github.com/chrisant996/intercomplete/tree/d3f4c980fbb3281f05f58b0d9a5b32bc3f85ca20)

- Initial release.
- `Ctrl+Shift+,` invokes `intercomplete.prevInterComplete` to choose a completion candidate earlier in the document.
- `Ctrl+Shift+.` invokes `intercomplete.nextInterComplete` to choose a completion candidate later in the document.
- `Ctrl+Shift+Space` during an interactive completion invokes `intercomplete.moreInterComplete` to insert more from the chosen completion candidate.
- `Escape` during an interactive completion ends the completion.
- The `intercomplete.feedbackMode` setting chooses "decoration" or "status bar" as the way to show feedback about the current completion candidate.
