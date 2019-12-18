var fs = require('fs');
var path = require('path');
var glob = require('glob');

// Given a file name, scan it for dependency names
// and return a list of names.
function findDeps(filename, options)
{
    var deps = [];

    // VHDL file?
    if (filename.toLowerCase().endsWith(".vhd") || filename.toLowerCase().endsWith(".vhdl"))
    {
        try
        {
            // Read the file content
            var content = fs.readFileSync(filename, "utf8");
            var depFinder = /(?:(?:(?:entity|use)\swork\.)|(?:--xilt:require:))([^\.\s]+)/gim;
            var match;
            while (match = depFinder.exec(content))
                deps.push(match[1]);
        }
        catch (x)
        {
            return [];
        }
    }

    return deps;
}

const depExtensions = [ ".vhd", ".vhdl", ".v" ];

// Given a qualified base name, try locating the file
// with one of several possible extensions
function doesFileExistWithSuitableExtension(name, options)
{
    for (let i=0; i<depExtensions.length; i++)
    {
        var finalName = name + depExtensions[i];
        if (fs.existsSync(finalName))
        {
            if (options.debug)
                console.log("  trying", finalName, "- found!");
            return finalName;
        }
        if (options.debug)
            console.log("  trying", finalName, "- not found");
    }

    return null;
}

// Try to resolve the location of a dependent file by looking first
// in that same folder as the file that referenced it and secondly
// by searching the dependency path
function resolveDepFile(dep, referencingFileName, depPath, options)
{
    if (options.debug)
        console.log("resolving dependency:", dep, "from", referencingFileName);

    // Look in the same folder as the referencing file
    var refFolder = path.dirname(referencingFileName);
    var resolvedName = doesFileExistWithSuitableExtension(path.join(refFolder, dep), options);
    if (resolvedName)
        return resolvedName;

    // Search the dep path
    for (let i=0; i<depPath.length; i++)
    {
        var resolvedName = doesFileExistWithSuitableExtension(path.join(depPath[i], dep), options);
        if (resolvedName)
            return resolvedName;
    }

    if (options.debug)
        console.log(" - not found");

    // Not found
    return null;
}

// Scan VHDL files for dependencies
// Params
//  * baseDir - base directory that root files are relative to
//  * rootFiles - string array of the root file specs
//  * options.depPath - path to look for dependent files (relative to baseDir)
// Returns
//  * a string array of all files, relative to the baseDir (or absolute)
function scanDeps(baseDir, rootFiles, options)
{
    // Glob the root files to build fully qualified list
    var allFiles = [];
    for (let i=0; i<rootFiles.length; i++)
    {
        var rootFile = rootFiles[i];

        // Is this an exclude spec?
        let exclude = rootFile.startsWith("!");
        if (exclude)
            rootFile = rootFile.substring(1);

        // Qualify it
        if (!rootFile.startsWith('/'))
            rootFile = path.join(baseDir, rootFile);

        // Find matching files
        let files;
        if (glob.hasMagic(rootFile))
            files = glob.sync(rootFile);
        else
            files = [rootFile];

        // Add/Remove the found files
        for (let i=0; i<files.length; i++)
        {
            let file = files[i];
            let index = allFiles.indexOf(file);
            if (exclude)
            {
                if (index >= 0)
                {
                    allFiles.splice(index, 1);
                }
            }
            else
            {
                if (index < 0)
                    allFiles.push(file);
            }
        }
    }

    // Build full list of absolute dependency paths
    var depPath = [];
    if (options.depPath)
    {
        depPath = options.depPath.slice();
        for (let i=0; i<depPath.length; i++)
        {
            if (!depPath[i].startsWith("/"))
                depPath[i] = path.join(baseDir, depPath[i]);
        }
    }

    // Scan for dependencies
    var processedDeps = {};
    for (let i=0; i<allFiles.length; i++)
    {
        // Find the dependencies for this file
        var deps = findDeps(allFiles[i]);
        for (let j=0; j<deps.length; j++)
        {
            // Get the depenencies name
            var dep = deps[j];

            // Already processed?
            if (processedDeps[dep])
                continue;
            processedDeps[dep] = true;

            // Try to resolve it
            var resolved = resolveDepFile(dep, allFiles[i], depPath, options);
            if (resolved)
            {
                if (allFiles.indexOf(resolved) < 0)
                    allFiles.push(resolved);
            }
        }
    }

    // Convert all paths back to relative paths to the base directory
    allFiles = allFiles.map(x => path.relative(baseDir, x));

    return allFiles;
}

//var files = scanDeps(
//    "/home/brad/Projects/MimasV2/05-seven-segment-3", 
//    [ "**/*.vhd", "*.ucf" ], 
//    { 
//        depPath: "../modules",
//        debug: false
//    }
//)
//
//for (let i=0; i<files.length; i++)
//{
//    console.log(files[i]);
//}


module.exports = scanDeps;