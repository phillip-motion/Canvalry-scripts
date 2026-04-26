# Canvalry Scripts
A collection of Cavalry scripts from Canva’s Motion Powerhouse team to speed up workflows and make great motion design.

These scripts are tools created internally by Canva's motion designers, and are mostly vibe coded. They are *not supported by the Cavalry team*.

Download each one below.

Copy the scripts to your Cavalry Scripts folder. 


# Utilities

### [Convert Frame Rate →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/Convert.Frame.Rate.jsc)
<img width="312" height="230" alt="Screenshot 2025-11-05 at 21 38 38" src="https://github.com/user-attachments/assets/f14bfb71-ad9c-47d2-af95-4946a854d09e" />

<br />
Converts frame rate while maintaining visual timing of animations and easing curves. Just enter a frame rate and hit Apply! 
<br /><br />


> [!IMPORTANT]
> This will only modify comp duration, keyframe placement and layer timing. It will not modify any stagger, oscillator or similar procedural elements.

<br />


### [Easey →](https://github.com/sammularczyk/easey)
The missing speed graph for Cavalry.

<br />

### [Lottie Importer →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/Lottie.Importer.jsc)
Very, very WIP lottie import script.

<br />

### [CSS Gradient Converter →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/CSS.Gradient.Converter.jsc)
Converts CSS gradient syntax (linear-gradient) to a Gradient Shader.

<br />

### [Set All Image Shaders to Mipmaps →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/Set.All.Image.Shaders.To.Mipmaps.jsc)
Sets all image shaders to mipmaps in the current composition. Clean up those crunchy edges.

<br />

## Text and content management

### [Localiser →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/Localiser.jsc)
Export and import all text strings from a file for translation.

https://github.com/user-attachments/assets/2a76ae4e-04c3-419d-935f-2144e5d7b75f

#### When exporting CSV
1. Rename the "originalValue" column to your default language
2. Add as many new column to the right as you like and title them with their corresponding language
3. Enter new translations for each line. Leave a cell blank to keep the original text.
4. Import back into Localiser and either choose language to apply, or duplicate all comps automatically with new values.

<br />

### [Find and Replace Text →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/Find.and.Replace.Text.jsc)
Find and replace any string in any comp.

<br />

## Scene management

### [Renamer →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/Renamer.jsc)
<img width="441" height="525" alt="Screenshot 2025-11-05 at 21 41 04" src="https://github.com/user-attachments/assets/c28ccd10-57a7-4623-b029-484e4fdfa32c" />
<br />

Makes renaming layers and project items simple. Find & replace, append and prepend, and number assets with ease.

<br />

### [Consolidate Assets →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/Consolidate.Assets.jsc)
Copies all assets into your Project folder.

<br />

### [Reveal Asset in Finder →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/Reveal.Asset.In.Finder.jsc)
Simple script, an alternative to Cavalry's inbuilt functionality.

<br />

### [Reduce Compositions →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/Reduce.Compositions.jsc)
Select the compositions you want to keep and run this script to remove the rest. Pair with Remove Unused Assets to quickly clean up a file.

<br />

### [Remove Unused Assets →](https://github.com/phillip-motion/Canvalry-scripts/releases/latest/download/Remove.Unused.Assets.jsc)
Removes all assets not used in a composition.

<br /><br />

# Developer Tools

### Check Update from Github
Simple script to compare update versions against a json file and log a console alert.

#### Notes
Some scripts make web API calls simply to check for updates. 

Feel free to open pull requests, dig through the code and use this to build your own tools. We release these freely under the MIT license to help further the Cavalry community!

Brought to you by the Canva Creative Team with assistance from Cursor. Repo maintained by Phillip Tibballs, Jack Jaeschke and Sam Mularczyk.
