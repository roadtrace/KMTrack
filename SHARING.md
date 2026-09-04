# Sharing inspections

- Use **Import** beside **Select** in the inspection log. Choose an original KMTrack Excel (.xlsx) or Photos ZIP (.zip).
- Review the new-entry count, dates, photos, duplicates, conflicts, and validation issues. Set a batch label and optionally enter/correct inspector names before importing.
- Imports append records. Existing entries are never replaced. Identical records are skipped; changed records sharing an original ID are reported as conflicts and skipped.
- **Source / inspector filters** in the log and **Filter** on the map can select own inspections, imported inspections, an import batch, or an inspector, together with dates and defect type. Existing entries without import metadata count as own inspections.
- **Undo last import** removes the latest batch's remaining entries and its photos, including any later edits to that batch. It remains available after reopening the app. It does not remove unrelated entries.
- Each export asks for an optional inspector name and remembers it on this device. It fills only this device's unnamed exported records; existing names and imported records are not overwritten.

## Compatibility

The original **Inspection Log** worksheet keeps its existing columns and formatting. New exports add a **Sharing Details** worksheet carrying inspector names and full-precision records/stable IDs. ZIP manifests use version 2 and retain stable IDs and provenance.

Original older KMTrack workbooks and version-1 Photos ZIP files remain importable. Older workbooks lack stable IDs, names, full photo metadata, and sub-meter KM precision. Their KM column is converted from meters back into internal kilometers. Missing data cannot be reconstructed.

Excel does not contain photo images. Photos ZIP is the preferred exchange format for complete inspections and available stamped photos. Missing images are reported; imports do not synthesize replacements or original unstamped images.

Use original KMTrack exports, not arbitrary spreadsheets. If inspection cells no longer match a new workbook's sharing details, import rejects it rather than silently using stale data. Compressed files require browser support for raw-deflate decompression; original KMTrack exports use uncompressed ZIP entries.

Limits: 250 MB compressed/expanded archive and 10,000 inspection records per import. ZIP checksums, unsafe paths, encrypted archives, field types, dates, and coordinate ranges are checked. A photo or storage failure rolls back the import's entries and newly written photos.

## Checks

Run `node --test *.test.js`. `sharing-browser-check.js` is a Playwright CLI check restricted to a disposable server at `http://127.0.0.1:4175`; it verifies new/legacy Excel round-trips and opens the import preview. Browser screenshots and downloads are ignored by Git.
