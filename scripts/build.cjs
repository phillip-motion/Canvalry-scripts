#!/usr/bin/env node

/**
 * Build Wrapper Script for Canvalry Scripts
 * 
 * This script orchestrates the full build process:
 * 1. Pre-process: Embed assets into source files (creates .build-src/)
 * 2. Swap folders: Temporarily swap src/ with .build-src/
 * 3. Bundle: Run the cavalry-bundler
 * 4. Restore: Swap folders back
 * 5. Cleanup: Remove temp directories
 * 
 * Usage:
 *   node scripts/build.cjs          # Production build
 *   node scripts/build.cjs --dev    # Development build (watch mode)
 *   node scripts/build.cjs --release # Production build (same as no args)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const ROOT_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const BUILD_SRC_DIR = path.join(ROOT_DIR, '.build-src');
const SRC_ORIGINAL_DIR = path.join(ROOT_DIR, '.src-original');

// Parse command line arguments
const args = process.argv.slice(2);
const isDev = args.includes('--dev');
const isRelease = args.includes('--release');

// Track state for cleanup
let directoriesSwapped = false;
let directoriesRestored = false;

/**
 * Run a command and return the result
 */
function runCommand(command, options = {}) {
    console.log(`\n> ${command}\n`);
    try {
        execSync(command, { 
            cwd: ROOT_DIR, 
            stdio: 'inherit',
            ...options 
        });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Swap directories safely
 */
function swapDirectories() {
    console.log('\n🔄 Swapping directories...');
    
    // Rename src/ to .src-original/
    if (fs.existsSync(SRC_DIR)) {
        fs.renameSync(SRC_DIR, SRC_ORIGINAL_DIR);
        console.log('  ✓ src/ → .src-original/');
    }
    
    // Rename .build-src/ to src/
    if (fs.existsSync(BUILD_SRC_DIR)) {
        fs.renameSync(BUILD_SRC_DIR, SRC_DIR);
        console.log('  ✓ .build-src/ → src/');
    }
    
    directoriesSwapped = true;
    directoriesRestored = false;
}

/**
 * Restore directories
 */
function restoreDirectories() {
    // Skip if already restored or never swapped
    if (directoriesRestored || !directoriesSwapped) {
        return;
    }
    
    console.log('\n🔄 Restoring directories...');
    
    // Rename src/ back to .build-src/
    if (fs.existsSync(SRC_DIR)) {
        // Remove existing .build-src if it exists (shouldn't happen but be safe)
        if (fs.existsSync(BUILD_SRC_DIR)) {
            fs.rmSync(BUILD_SRC_DIR, { recursive: true, force: true });
        }
        fs.renameSync(SRC_DIR, BUILD_SRC_DIR);
        console.log('  ✓ src/ → .build-src/');
    }
    
    // Rename .src-original/ back to src/
    if (fs.existsSync(SRC_ORIGINAL_DIR)) {
        fs.renameSync(SRC_ORIGINAL_DIR, SRC_DIR);
        console.log('  ✓ .src-original/ → src/');
    }
    
    directoriesRestored = true;
}

/**
 * Cleanup temp directories
 */
function cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (fs.existsSync(BUILD_SRC_DIR)) {
        fs.rmSync(BUILD_SRC_DIR, { recursive: true, force: true });
        console.log('  ✓ Removed .build-src/');
    }
    
    if (fs.existsSync(SRC_ORIGINAL_DIR)) {
        fs.rmSync(SRC_ORIGINAL_DIR, { recursive: true, force: true });
        console.log('  ✓ Removed .src-original/');
    }
}

/**
 * Handle process exit - ensure directories are restored
 */
function setupExitHandler() {
    const exitHandler = (signal) => {
        console.log(`\n\n⚠️  Received ${signal}, restoring directories...`);
        restoreDirectories();
        cleanup();
        process.exit(1);
    };
    
    process.on('SIGINT', () => exitHandler('SIGINT'));
    process.on('SIGTERM', () => exitHandler('SIGTERM'));
    process.on('uncaughtException', (err) => {
        console.error('\n❌ Uncaught exception:', err);
        restoreDirectories();
        cleanup();
        process.exit(1);
    });
}

/**
 * Main build function
 */
async function main() {
    const mode = isDev ? 'development' : 'production';
    console.log(`\n🚀 Starting ${mode} build...\n`);
    console.log('=' .repeat(50));
    
    // Setup exit handler to restore directories on error/interrupt
    setupExitHandler();
    
    try {
        // Step 1: Pre-process assets
        console.log('\n📦 Step 1: Pre-processing assets...');
        const embedSuccess = runCommand('node scripts/embed-assets.cjs');
        if (!embedSuccess) {
            throw new Error('Asset embedding failed');
        }
        
        // Step 2: Swap directories
        swapDirectories();
        
        // Step 3: Run bundler
        console.log('\n📦 Step 3: Running bundler...');
        const env = isDev ? 'development' : 'production';
        const bundlerCmd = `cross-env NODE_ENV=${env} npx bundler`;
        
        if (isDev) {
            // For dev mode, we need to run bundler in watch mode
            // This is tricky because watch mode doesn't exit
            // For now, just run once - user can re-run manually
            console.log('  ℹ️  Note: Dev mode runs bundler once (no watch mode with asset embedding)');
        }
        
        const bundleSuccess = runCommand(bundlerCmd);
        
        // Step 4: Restore directories
        restoreDirectories();
        
        // Step 5: Cleanup
        cleanup();
        
        if (!bundleSuccess) {
            throw new Error('Bundler failed');
        }
        
        console.log('\n' + '=' .repeat(50));
        console.log('✨ Build complete!');
        console.log('   Output: build/');
        
    } catch (error) {
        console.error('\n❌ Build failed:', error.message);
        
        // Try to restore directories even on error
        try {
            restoreDirectories();
            cleanup();
        } catch (restoreError) {
            console.error('⚠️  Error restoring directories:', restoreError.message);
            console.error('   You may need to manually restore src/ from .src-original/');
        }
        
        process.exit(1);
    }
}

// Run
main();
