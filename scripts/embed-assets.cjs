#!/usr/bin/env node

/**
 * Asset Embedding Pre-processor for Canvalry Scripts
 * 
 * This script runs BEFORE the bundler to embed images as base64 into source files.
 * It copies source files to .build-src/, embedding assets where referenced.
 * 
 * Features:
 * - Copies all source files to .build-src/
 * - Embeds base64 images into files that reference them
 * - Auto-detects version numbers from filenames (e.g., icon-apply_v01.png)
 * - Uses the highest version found for each icon
 * - Caches processed images for faster rebuilds
 * 
 * Versioning:
 * - Name your files with versions: icon-apply_v01.png, icon-apply_v02.png
 * - The script automatically finds and uses the highest version
 * - When updating an icon, just add the new version file
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SRC_DIR = path.join(__dirname, '..', 'src');
const BUILD_SRC_DIR = path.join(__dirname, '..', '.build-src');
const ICONS_DIR = path.join(SRC_DIR, 'icons');
const CACHE_FILE = path.join(__dirname, '..', '.asset-cache.json');

/**
 * Load or initialize build cache
 */
function loadCache() {
    if (fs.existsSync(CACHE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        } catch (e) {
            console.warn('  ⚠️  Cache file corrupted, rebuilding...');
        }
    }
    return { images: {} };
}

/**
 * Save build cache
 */
function saveCache(cache) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

/**
 * Recursively copy directory
 */
function copyDirSync(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            // Skip icons directory - we embed them, don't copy
            if (entry.name === 'icons') {
                continue;
            }
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Remove directory recursively
 */
function removeDirSync(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Scan icons directory and build a map of base names to their highest versioned files
 * e.g., { 'icon-apply.png': { version: 2, filename: 'icon-apply_v02.png' } }
 */
function buildVersionMap() {
    if (!fs.existsSync(ICONS_DIR)) {
        console.warn(`  ⚠️  Icons directory not found: ${ICONS_DIR}`);
        return {};
    }
    
    const files = fs.readdirSync(ICONS_DIR);
    const versionMap = {};
    
    // Pattern: basename_vXX.ext (e.g., icon-apply_v01.png)
    const versionPattern = /^(.+)_v(\d+)(\.[^.]+)$/;
    
    for (const file of files) {
        const match = file.match(versionPattern);
        if (match) {
            const [, baseName, versionStr, ext] = match;
            const version = parseInt(versionStr, 10);
            const key = baseName + ext;  // e.g., "icon-apply.png"
            
            if (!versionMap[key] || version > versionMap[key].version) {
                versionMap[key] = {
                    version: version,
                    filename: file,
                    ext: ext
                };
            }
        }
    }
    
    return versionMap;
}

/**
 * Process image: read and convert to base64
 */
function processImage(versionedFilename, cache) {
    const imagePath = path.join(ICONS_DIR, versionedFilename);
    
    if (!fs.existsSync(imagePath)) {
        console.warn(`  ⚠️  Image not found: ${versionedFilename}`);
        return null;
    }
    
    const stats = fs.statSync(imagePath);
    const mtime = stats.mtimeMs;
    
    // Check cache
    if (cache.images[versionedFilename] && 
        cache.images[versionedFilename].mtime === mtime) {
        return { cached: true, base64: cache.images[versionedFilename].base64 };
    }
    
    const buffer = fs.readFileSync(imagePath);
    const base64 = buffer.toString('base64');
    
    // Update cache
    cache.images[versionedFilename] = {
        mtime: mtime,
        base64: base64
    };
    
    const sizeKB = (base64.length * 0.75 / 1024).toFixed(1);
    console.log(`  ✓ Encoded ${versionedFilename} (${sizeKB} KB)`);
    
    return { cached: false, base64: base64 };
}

/**
 * Extract all image references from code
 * Matches patterns like: ui.scriptLocation + "/icons/icon-apply.png"
 */
function extractImageReferences(code) {
    const patterns = [
        /ui\.scriptLocation\s*\+\s*["']\/icons\/([^"']+)["']/g,
        /ui\.scriptLocation\s*\+\s*["']\/easey_assets\/([^"']+)["']/g,
        /ui\.scriptLocation\s*\+\s*["']\/assets\/([^"']+)["']/g
    ];
    
    const images = new Set();
    
    for (const regex of patterns) {
        let match;
        while ((match = regex.exec(code)) !== null) {
            images.add(match[1]);
        }
    }
    
    return Array.from(images);
}

/**
 * Generate embedded assets code for a specific script
 */
function generateEmbeddedAssetsCode(scriptName, imageMap) {
    const safeName = scriptName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    
    const lines = [
        '// ========================================',
        '// Embedded Assets (Base64)',
        '// ========================================',
        `var ${safeName}_ASSETS_PATH = api.getTempFolder() + "/canvalry_${scriptName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_assets/";`,
        `var ${safeName}_EMBEDDED_ASSETS = {`
    ];
    
    const entries = Object.entries(imageMap);
    entries.forEach(([versionedName, base64], index) => {
        const isLast = index === entries.length - 1;
        lines.push(`  "${versionedName}": "${base64}"${isLast ? '' : ','}`);
    });
    
    lines.push('};');
    lines.push('');
    lines.push(`function initialize${safeName.charAt(0) + safeName.slice(1).toLowerCase()}Assets() {`);
    lines.push(`  if (!api.isDirectory(${safeName}_ASSETS_PATH)) {`);
    lines.push(`    api.makeFolder(${safeName}_ASSETS_PATH);`);
    lines.push('  }');
    lines.push('  ');
    lines.push(`  for (var filename in ${safeName}_EMBEDDED_ASSETS) {`);
    lines.push(`    var filePath = ${safeName}_ASSETS_PATH + filename;`);
    lines.push('    if (!api.isFile(filePath)) {');
    lines.push(`      var base64Data = ${safeName}_EMBEDDED_ASSETS[filename];`);
    lines.push('      api.writeEncodedToBinaryFile(filePath, base64Data);');
    lines.push('    }');
    lines.push('  }');
    lines.push('}');
    lines.push('');
    lines.push(`initialize${safeName.charAt(0) + safeName.slice(1).toLowerCase()}Assets(); // Run on load`);
    lines.push('');
    
    return { code: lines.join('\n'), assetsPathVar: `${safeName}_ASSETS_PATH` };
}

/**
 * Replace image paths in code with versioned temp folder paths
 */
function replaceImagePaths(code, assetsPathVar, originalToVersioned) {
    let result = code;
    
    for (const [original, versioned] of Object.entries(originalToVersioned)) {
        const patterns = [
            new RegExp(`ui\\.scriptLocation\\s*\\+\\s*["']/icons/${escapeRegex(original)}["']`, 'g'),
            new RegExp(`ui\\.scriptLocation\\s*\\+\\s*["']/easey_assets/${escapeRegex(original)}["']`, 'g'),
            new RegExp(`ui\\.scriptLocation\\s*\\+\\s*["']/assets/${escapeRegex(original)}["']`, 'g')
        ];
        
        for (const pattern of patterns) {
            result = result.replace(pattern, `${assetsPathVar} + "${versioned}"`);
        }
    }
    
    return result;
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process a single source file - embed assets if needed
 */
function processSourceFile(filename, cache, versionMap) {
    const srcPath = path.join(BUILD_SRC_DIR, filename);
    
    if (!fs.existsSync(srcPath)) {
        return { processed: false };
    }
    
    let content = fs.readFileSync(srcPath, 'utf8');
    
    // Extract image references
    const imageRefs = extractImageReferences(content);
    
    if (imageRefs.length === 0) {
        return { processed: false, reason: 'no images' };
    }
    
    console.log(`\n📦 Processing ${filename}...`);
    console.log(`  ℹ️  Found ${imageRefs.length} image reference(s)`);
    
    // Process images
    const imageMap = {};
    const originalToVersioned = {};
    
    for (const originalName of imageRefs) {
        const versionInfo = versionMap[originalName];
        
        if (!versionInfo) {
            console.warn(`  ⚠️  No versioned file found for: ${originalName}`);
            console.warn(`     Expected files like: ${originalName.replace(/(\.[^.]+)$/, '_v01$1')}`);
            continue;
        }
        
        const result = processImage(versionInfo.filename, cache);
        if (result) {
            imageMap[versionInfo.filename] = result.base64;
            originalToVersioned[originalName] = versionInfo.filename;
            
            if (result.cached) {
                console.log(`  ⚡ ${originalName} → ${versionInfo.filename} (cached)`);
            }
        }
    }
    
    if (Object.keys(imageMap).length === 0) {
        console.log('  ⚠️  No images processed');
        return { processed: false, reason: 'no valid images' };
    }
    
    // Get script name from filename
    const scriptName = path.basename(filename, '.js');
    
    // Generate embedded assets code
    const { code: embeddedAssetsCode, assetsPathVar } = generateEmbeddedAssetsCode(scriptName, imageMap);
    
    // Replace image paths
    content = replaceImagePaths(content, assetsPathVar, originalToVersioned);
    
    // Find insertion point (after initial comments)
    let insertIndex = 0;
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line === '') {
            insertIndex += lines[i].length + 1;
        } else {
            break;
        }
    }
    
    // Insert embedded assets code
    content = content.slice(0, insertIndex) + '\n' + embeddedAssetsCode + '\n' + content.slice(insertIndex);
    
    // Write back to .build-src
    fs.writeFileSync(srcPath, content, 'utf8');
    console.log(`  ✓ Embedded assets into ${filename}`);
    
    return { processed: true, imageCount: Object.keys(imageMap).length };
}

/**
 * Main function
 */
function main() {
    console.log('🎨 Pre-processing assets for build...\n');
    
    // Clean and create .build-src directory
    console.log('📂 Setting up .build-src directory...');
    removeDirSync(BUILD_SRC_DIR);
    
    // Copy all source files to .build-src
    console.log('  ℹ️  Copying source files...');
    copyDirSync(SRC_DIR, BUILD_SRC_DIR);
    console.log('  ✓ Source files copied to .build-src/');
    
    // Build version map from icon files
    console.log('\n📂 Scanning icons directory...');
    const versionMap = buildVersionMap();
    const iconCount = Object.keys(versionMap).length;
    
    if (iconCount === 0) {
        console.log('  ⚠️  No versioned icons found');
        console.log('     Files should be named like: icon-apply_v01.png');
    } else {
        console.log(`  ℹ️  Found ${iconCount} icon(s):`);
        for (const [baseName, info] of Object.entries(versionMap)) {
            console.log(`     ${baseName} → ${info.filename}`);
        }
    }
    
    // Load cache
    const cache = loadCache();
    
    // Get all JS files in .build-src
    const files = fs.readdirSync(BUILD_SRC_DIR).filter(f => f.endsWith('.js'));
    
    if (files.length === 0) {
        console.log('\nℹ️  No JS files found in .build-src/');
        return;
    }
    
    // Process each file
    let processedCount = 0;
    for (const file of files) {
        const result = processSourceFile(file, cache, versionMap);
        if (result.processed) {
            processedCount++;
        }
    }
    
    // Save cache
    saveCache(cache);
    
    console.log(`\n✨ Pre-processing complete! (${processedCount} file(s) with embedded assets)`);
    console.log('   Output: .build-src/');
}

// Run
main();
