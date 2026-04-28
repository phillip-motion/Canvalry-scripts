# Localiser 
Export all text strings to JSON/CSV for easy localisation.

# Long description
Localisation, made easy. Localiser takes all your text strings in every comp and outputs a JSON/CSV for easy translation. 

When you're done, just import the file back in and apply the new languages.

Made by your friends in the Canva Creative Team.


# Manual

## Installation
1. Download script file
2. In Cavalry, go to Scripts > Open Script Folder...
3. Drag script into Script folder

## Usage
1. Go to Scripts > Localiser in Cavalry
2. Change settings and apply!

## JSON Export/Import
**Export:** Click "Export JSON..." button → saves all text strings to JSON file.

**Import:** Load JSON → single language application only.

## CSV Export/Import (Multi-Language)
**Export:** Click "Export CSV...". This creates a CSV with headers:
- `compID` - composition identifier
- `nodeID` - layer node identifier
- `originalValue` - current text
- `[Language]` columns for translations

**Import:** Click "Load CSV..." → dropdown appears with detected language columns.


## Apply Translations
1. Load CSV file
2. Select language from dropdown
3. Click "Apply" → replaces text in current comps

## Duplicate for All Languages
Load CSV → Click "Duplicate Comps for All Languages":
- Creates copy of each composition for every language column
- Appends language suffix to comp names
- Applies translations automatically

## Usage Workflow
1. Export existing text (JSON or CSV)
2. Edit file externally (spreadsheet for CSV)
3. Import edited file
4. Apply or duplicate comps

## Changelog

[1.0.0] - 2026-04-28
- Initial release