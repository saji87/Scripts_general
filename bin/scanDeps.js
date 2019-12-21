var fs = require('fs');
var path = require('path');
var glob = require('glob');

function path_join(a, b)
{
    if (b.startsWith("/"))
        return b;
    else
        return path.join(a, b);
}

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
            var depFinder = /(?:(?:entity|use)\swork\.)([^\.\s]+)/gim;
            var match;
            while (match = depFinder.exec(content))
            {
                deps.push(match[1]);
            }

            var reqFinder = /--xilt:require:(.*)/g;
            while (match = reqFinder.exec(content))
            {
                deps.push(">" + match[1]);
            }
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

    var refFolder = path.dirname(referencingFileName);

    if (dep.startsWith(">"))
        return path_join(refFolder, dep.substring(1));

    // Look in the same folder as the referencing file
    var resolvedName = doesFileExistWithSuitableExtension(path_join(refFolder, dep), options);
    if (resolvedName)
        return resolvedName;

    // Search the dep path
    for (let i=0; i<depPath.length; i++)
    {
        var resolvedName = doesFileExistWithSuitableExtension(path_join(depPath[i], dep), options);
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
            rootFile = path_join(baseDir, rootFile);

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
                depPath[i] = path_join(baseDir, depPath[i]);
        }
    }

    // A map of filename to array of other files that it depends on
    var fileDepMap = {};

    // Scan for dependencies
    for (let i=0; i<allFiles.length; i++)
    {
        // Create an array of dependencies for this file
        var fileDeps = [];
        fileDepMap[allFiles[i]] = fileDeps;

        // Find the dependencies for this file
        var deps = findDeps(allFiles[i]);
        for (let j=0; j<deps.length; j++)
        {
            // Get the depenency's name
            var dep = deps[j];

            // Try to resolve it
            var resolved = resolveDepFile(dep, allFiles[i], depPath, options);
            if (resolved)
            {
                // Add to map for this file
                fileDeps.push(resolved);

                // If it's a file we haven't seen, add it to the list still
                // to be processed.
                if (allFiles.indexOf(resolved) < 0)
                    allFiles.push(resolved);
            }
        }
    }

    // Build a sorted list where all files appear after any files they
    // depend on.  (circular references shouldn't happen but handle it anyway)
    // ie: Topological sort.  Use Kahn's algorithm for simplicity

    // L ← Empty list that will contain the sorted elements
    var L = [];

    // S ← Set of all nodes with no incoming edge
    var S = allFiles.filter(x => fileDepMap[x].length == 0);

    // while S is non-empty do
    while (S.length != 0)
    {
        // remove a node n from S
        var n = S.shift();

        // add n to tail of L
        L.push(n);

        // for each node m with an edge e from n to m do
        for (let i=0; i<allFiles.length; i++)
        {
            var m = allFiles[i];
            var mdeps = fileDepMap[m];
            var index = mdeps.indexOf(n);

            // remove edge e from the graph
            if (index >= 0)
            {
                mdeps.splice(index, 1);

                // if m has no other incoming edges then
                if (mdeps.length == 0)
                {
                    //insert m into S
                    S.push(m);
                }
            }
        }
    }

    // Add any missing files to L (means there was a circular reference)
    for (let i=0; i<allFiles.length; i++)
    {
        if (L.indexOf(allFiles[i]) < 0)
            L.push(allFiles[i])
    }

    // Convert all paths back to relative paths to the base directory
    L = L.map(x => path.relative(baseDir, x));
    return L;
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