# Canvalry Scripts
A collection of Cavalry scripts from Canva’s Motion Powerhouse team to speed up workflows and make great motion design.

<p align="center" style="margin-top:0;margin-bottom:0;">
  <a href="https://github.com/phillip-motion/canvalry-scripts/zipball/master">
    <img width="186" height="108" alt="quiver_download" src="https://github.com/user-attachments/assets/9295a646-c7ba-4649-b069-2e78204dc1ce" />
  </a>
</p>

Install by copying the Canva folder to your Cavalry Scripts directory.

> [!IMPORTANT]
> If you're using Cavalry Free, please use the encrypted scripts in the .jsc folder (these may not be as up to date as the .js files)

## Convert Frame Rate
<img width="312" height="230" alt="Screenshot 2025-11-05 at 21 38 38" src="https://github.com/user-attachments/assets/f14bfb71-ad9c-47d2-af95-4946a854d09e" />

Converts frame rate while maintaining visual timing of animations and easing curves. Just enter a frame rate and hit Apply! 

> [!NOTE]
> This will only modify comp duration, keyframe placement and layer timing. It will not modify any stagger, oscillator or similar procedural elements.

## Easey
<img width="358" height="484" alt="Screenshot 2025-11-05 at 21 37 31" src="https://github.com/user-attachments/assets/0ef835e8-c318-4e14-a0e1-29826cfc97f2" />

> [!IMPORTANT]
> When installing, place both Easey.js AND the easey_assets folder in your Cavalry Scripts folder.

> [!TIP]
> Hold shift while dragging handles to mirror them in the Speed graph, or lock them to the closest axis in the Value graph.

Adds a speed graph and allows cubic-bezier notation for easing between two keyframes. Makes easing easy. 

You can also save presets, and copy duration and easing values to pass to developers.

If you're looking for a more polished value graph editor that supports Magic Easing, check out [Curves at Scenery.io](https://scenery.io/scripts/curves-42xvUYqCpvY).

## Renamer
<img width="441" height="525" alt="Screenshot 2025-11-05 at 21 41 04" src="https://github.com/user-attachments/assets/c28ccd10-57a7-4623-b029-484e4fdfa32c" />

Makes renaming layers and project items simple. Find & replace, append and prepend, and number assets with ease.

## CSS Gradient Converter
Converts CSS gradient syntax (linear-gradient) to a Gradient Shader.

## Reduce Compositions
Select the compositions you want to keep and run this script to remove the rest. Pair with Remove Unused Assets to quickly clean up a file.

## Remove Unused Assets
Removes all assets not used in a composition.

## Set All Image Shaders to Mipmaps
Sets all image shaders to mipmaps in the current composition. Clean up those crunchy edges.

# Developer Tools

## Check Update from Github
Simple script to compare update versions against a json file and log a console alert.

### Notes
Some scripts make web API calls simply to check for updates. 

Feel free to open pull requests, dig through the code and use this to build your own tools. We release these freely under the MIT license to help further the Cavalry community!

Brought to you by the Canva Creative Team with assistance from Cursor. Repo maintained by Phillip Tibballs, Jack Jaeschke and Sam Mularczyk.
