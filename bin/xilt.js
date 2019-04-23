#!/usr/bin/env node

var child_process = require('child_process');
var path = require('path');
var fs = require('fs');
var os = require('os');

// Work out current folder
var cwd = process.cwd();
var folderName = path.parse(cwd).name;

// ------------ Platform/Environment Checks --------------

// Check supported platform
if (os.platform() != "linux")
{
    console.log("xilt is only supported on linux");
    process.exit(7);
}

// Find Xilinx tools
var xilinxDir = "/opt/Xilinx/14.7/";
if (!fs.existsSync(xilinxDir))
{
    console.log(`Xilinx tools not found at ${xilinxDir}`);
    process.exit(7);
}

var xilinxBin = path.join(xilinxDir, "ISE_DS/ISE/bin/lin64");


// ------------ Settings --------------

var action = "";
var debug = false;
var verbose = false;
var intStyle = "ise";
var settings = {
    projectName: null,
    intDir: null,
    outDir: null,
    device: null,
    startupClock: null,
    topModule: null,
    device: null,
    hdlLanguage: null,
    ucfFile: null,
    xstFlags: [],
    ngdBuildFlags: [],
    mapFlags: [],
    parFlags: [],
    bitGenFlags: [],
    sourceFiles: [],
};

// ------------ Command Line Parse --------------

/*
if (process.argv[2] == 'help' || process.argv[2] == '-h' || process.argv[2] == '--help' || process.argv[2] == '/?')
{
    showHelp();
}
*/


function processCommandLine(argv)
{
	for (var i=0; i<argv.length; i++)
	{
		var a = argv[i];

		var isSwitch = false;
		if (a.startsWith("--"))
		{
			isSwitch = true;
			a = a.substring(2);
		}
		else if (a.startsWith("/"))
		{
			isSwitch = true;
			a = a.substring(1);
		}

		if (isSwitch)
		{
            var parts = a.split(':');
            if (parts.length > 2)
            {
                parts = [parts[0], parts.slice(1).join(":")]
            }
			if (parts.length == 2)
			{
				if (parts[1]=='false' || parts[1]=='no')
					parts[1] = false;
                if (parts[1]=='true' || parts[1]=='yes')
                    parts[1] = true;
            }

            parts[0] = parts[0].toLowerCase();

            function pushParts(tool)
            {
                let underPos = parts[0].indexOf('_');
                settings[tool].push("-" + parts[0].substring(underPos+1));
                if (parts.length > 1)
                    settings[tool].push(parts[1]);
            }

            if (parts[0].startsWith("xst_"))
            {
                pushParts("xstFlags");
                continue;
            }
            if (parts[0].startsWith("ngd_") || parts[0].startsWith("ngdbuild_"))
            {
                pushParts("ngdBuildFlags");
                continue;
            }
            if (parts[0].startsWith("map_"))
            {
                pushParts("mapFlags");
                continue;
            }
            if (parts[0].startsWith("par_"))
            {   
                pushParts("parFlags");
                continue;
            }
            if (parts[0].startsWith("bitgen_"))
            {
                pushParts("bitGenFlags");
                continue;
            }
            
            switch (parts[0])
            {
                case "debug":
                    debug = true;
                    break;

                case "verbose":
                    verbose = true;
                    break;
                
                case "projectname":
                    if (settings.projectName)
                        throw new Error("Duplicate projectName setting");
                    if (parts.length < 2)
                        throw new Error("projectName argument missing");
                    settings.projectName = parts[1];
                    break;

                case "device":
                    if (settings.device)
                        throw new Error("Duplicate device setting");
                    if (parts.length < 2)
                        throw new Error("device argument missing");
                    settings.device = parts[1];
                    break;

                case "startupclock":
                    if (settings.startupClock)
                        throw new Error("Duplicate startupClock setting");
                    if (parts.length < 2)
                        throw new Error("startupClock argument missing");
                    settings.startupClock = parts[1];
                    break;

                case "topmodule":
                    if (settings.topModule)
                        throw new Error("Duplicate topModule setting");
                    if (parts.length < 2)
                        throw new Error("topModule argument missing");
                    settings.topModule = parts[1];
                    break;

                case "intdir":
                    if (parts.length < 2)
                        throw new Error("intDir argument missing");
                    settings.intDir = parts[1];
                    break;

                case "outdir":
                    if (parts.length < 2)
                        throw new Error("outDir argument missing");
                    settings.outDir = parts[1];
                    break;

                case "help":
                    showHelp();
                    process.exit(0);
                    break;

                default:
                    throw new Error(`Unrecognized switch: --${parts[0]}`)
                    /*
                var xstFlags = [];
                var ngdBuildFlags = [];
                var mapFlags = [];
                var parFlags = [];
                var bitGenFlags = [];
                var sourceFiles = [];
                      */          
            }
		}
		else
		{
            switch (path.extname(a).toLowerCase())
            {
                case ".vhdl":
                case ".vhd":
                case ".v":
                    settings.sourceFiles.push(a);
                    break;

                case ".ucf":
                    if (settings.ucfFile)
                        throw new Error("Duplicate UCF file specified");
                    settings.ucfFile = a;
                    break;

                case "":
                    if (!action)
                    {
                        action = a.toLowerCase();
                    }
                    else
                    {
                        throw new Error(`Duplicate action specified: '${action}' or '${a.toLowerCase()}'?`);
                    }
                    break;


                default:
                    throw new Error(`Unknown file type: ${a}`);
            }
		}
	}
}

processCommandLine(process.argv.slice(2));


// ------------ Resolve Defaults ------------

if (!settings.projectName)
    settings.projectName = folderName;
if (!settings.topModule)
    settings.topModule = settings.projectName;
if (!settings.ucfFile)
    settings.ucfFile = settings.projectName + ".ucf";
if (!settings.startupClock)
    settings.startupClock = "CCLK";
if (!settings.hdlLanguage)
    settings.hdlLanguage = "VHDL";
if (!action)
    action = "build";
if (!settings.intDir)
    settings.intDir = "./build";
if (!settings.outDir)
    settings.outDir = settings.intDir;


switch (action)
{
    case "settings":
        console.log(settings);
        break;
        
    case "build":
    case "rebuild":
        build();
        break;

    case "clean":
        clean();
        break;
}


function createDirectories()
{
    // Ensure folders exist
    mkdirp(settings.intDir);
    mkdirp(settings.outDir);
}

function clean()
{
    rmdir(settings.intDir);
    rm(path.join(settings.intDir, settings.projectName + ".bit"));
}

function build()
{
    // Ensure folder exist
    createDirectories();

    // Check if settings have changed
    if (action == "build" && haveSettingsChanged())
    {
        console.log("Settings have changed, rebuilding...");
        action = "rebuild";
    }

    // Create XST files
    createXstProjectFile();
    createXstCommandFile();

    runXst();
    runNgdBuild();
    runMap();
    runPar();
    runBitGen();
}

function runXst()
{
    // Check if up to date
    var outputFile = path.join(settings.intDir, settings.projectName + ".ngc")
    var inputFiles = settings.sourceFiles.slice();
    inputFiles.push(settings.ucfFile);
    if (isUpToDate(outputFile, inputFiles))
        return;

    // Run it
    run(`${xilinxBin}/xst`, 
        [ 
            "-intstyle", intStyle, 
            "-ifn", `${settings.projectName}.xst`,
            "-ofn", `${settings.projectName}.syr`,
        ],
        {
            cwd: settings.intDir,
        }
    );
}

function runNgdBuild()
{
    var outputFile = path.join(settings.intDir, settings.projectName + ".ngd")
    var inputFiles = [
        path.join(settings.intDir, settings.projectName + ".ngc"),
        settings.ucfFile,
    ];
    if (isUpToDate(outputFile, inputFiles))
        return;

    var flags = settings.ngdBuildFlags.concat([
        "-intstyle", intStyle, 
        '-uc', path.resolve(settings.ucfFile),
        '-dd', '.',
        '-sd', 'ipcore_dir',
        '-p', settings.device,
        `${settings.projectName}.ngc`,
        `${settings.projectName}.ngd`
    ]);
    

    // Run it
    run(`${xilinxBin}/ngdbuild`, flags,  
        {
            cwd: settings.intDir,
        }
    );    
}

function runMap()
{
    var outputFile = path.join(settings.intDir, settings.projectName + "_map.ncd")
    var inputFiles = [
        path.join(settings.intDir, settings.projectName + ".ngd"),
        settings.ucfFile,
    ];
    if (isUpToDate(outputFile, inputFiles))
        return;

    var flags = settings.mapFlags.concat([
        "-intstyle", intStyle, 
        '-p', settings.device,
        '-o', settings.projectName + "_map.ncd",
        `${settings.projectName}.ngd`,
        `${settings.projectName}.pcf`,
    ]);
    

    // Run it
    run(`${xilinxBin}/map`, flags,  
        {
            cwd: settings.intDir,
        }
    );    
}


function runPar()
{
    var outputFile = path.join(settings.intDir, settings.projectName + ".ncd")
    var inputFiles = [
        path.join(settings.intDir, settings.projectName + "_map.ncd"),
        path.join(settings.intDir, settings.projectName + ".pcf"),
    ];
    if (isUpToDate(outputFile, inputFiles))
        return;

    var flags = settings.parFlags.concat([
        "-intstyle", intStyle, 
        `${settings.projectName}_map.ncd`,
        `${settings.projectName}.ncd`,
        `${settings.projectName}.pcf`,
    ]);

    // Run it
    run(`${xilinxBin}/par`, flags,  
        {
            cwd: settings.intDir,
        }
    );    
}


function runBitGen()
{
    var outputFile = path.join(settings.outDir, settings.projectName + ".bit")
    var inputFiles = [
        path.join(settings.intDir, settings.projectName + ".ncd"),
        path.join(settings.intDir, settings.projectName + ".pcf"),
    ];
    if (isUpToDate(outputFile, inputFiles))
        return;

    var flags = settings.bitGenFlags.concat([
        "-intstyle", intStyle, 
        `${settings.projectName}.ncd`,
        `${path.resolve(outputFile)}`,
        `${settings.projectName}.pcf`,
    ]);

    // Run it
    run(`${xilinxBin}/bitgen`, flags,  
        {
            cwd: settings.intDir,
        }
    );    
}


// ------------ Settings -----------

function haveSettingsChanged()
{
    // Settings file
    var settingsFile = path.join(settings.intDir, "xilt.json"); 

    // Get new settings
    var newSettingsStr = JSON.stringify(settings);

    // Get old settings
    var oldSettingsStr = null;
    if (fs.existsSync(settingsFile))
         oldSettingsStr = fs.readFileSync(settingsFile, 'utf8');

    // If they changed, clean the int dir
    var changed = newSettingsStr != oldSettingsStr;
    if (changed)
    {
        clean();
        createDirectories();
    }

    // Save the new settings
    fs.writeFileSync(settingsFile, newSettingsStr, 'utf8');
    return changed;
}



// ------------ XST --------------

function createXstProjectFile()
{
    let sb = "";
    for (let i=0; i<settings.sourceFiles.length; i++)
    {
        var file = path.resolve(settings.sourceFiles[i]);
        var ext = path.extname(settings.sourceFiles[i]);

        switch (ext.toLowerCase())
        {
            case ".vhdl":
            case ".vhd":
                sb += "vhdl work \"" + file + "\"\n";
                break;

            case ".v":
                sb += "verilog work \"" + file + "\"\n";
                break;

            default:
                throw new Error(`Internal error unknown source file type: ${file}`);
        }
    }

    fs.writeFileSync(path.join(settings.intDir, settings.projectName + ".prj"), sb);
}

function createXstCommandFile()
{
    var sb = "";
    sb += `set -tmpdir .\n`;
    sb += `set -xsthdpdir "xst"\n`;
    sb += `run\n`;
    sb += `-ifn "${settings.projectName}.prj"\n`;
    sb += `-ifmt mixed\n`;
    sb += `-ofn "${settings.projectName}"\n`;
    sb += `-ofmt NGC\n`
    sb += `-top ${settings.topModule}\n`;
    sb += `-p ${settings.device}\n`;
    sb += `-opt_mode Speed\n`;
    sb += `-opt_level 1\n`;
    fs.writeFileSync(path.join(settings.intDir, settings.projectName + ".xst"), sb);
}

// ------------ Help --------------

function showHelp()
{
    console.log("xilt - Xilinx Command Line Tools");
    console.log("Copyright (C) 2019 Topten Software.  All Rights Reserved");
    console.log();
}

// ------------ Utility Functions --------------



function merge(x, y)
{
    if (!y)
        return x;

    var keys = Object.keys(y);
    for (var i=0; i<keys.length; i++)
    {
        x[keys[i]] = y[keys[i]];
    }

    return x;
}

function mergeMissing(x, y)
{
    if (!y)
        return x;

    var keys = Object.keys(y);
    for (var i=0; i<keys.length; i++)
    {
        if (!x[keys[i]])
        {
            x[keys[i]] = y[keys[i]];
        }
    }

    return x;
}

function parseOptions(file)
{
    if (!fs.existsSync(file))
        return {};

    try
    {
        var options = JSON.parse(fs.readFileSync(file, 'UTF8'));

        if (options[os.platform()])
        {
            merge(options, options[os.platform()]);
            delete options[os.platform()];
        }

        return options;
    }
    catch (err)
    {
        console.error(`Error parsing options file '${file}' - ${err}`);
        process.exit(7);
    }
}

function escapeArg(x)  
{
    if (os.platform() == "win32")
        return x.indexOf(' ') >= 0 ? `"${x}"` : x;
    else
        return x.replace(/ /g, '\\ ');
}

function run(cmd, args)
{
	if (os.platform() == "win32")
		cmd += ".exe";

    if (options.verbose)
    {
        console.log(cmd, args.map(escapeArg).join(" "));
    }

    return child_process.spawnSync(cmd, args, { stdio: 'inherit' });
}

function getEnv(name, defVal)
{
    if (process.env[name])
        return process.env[name];
    else
        return defVal;
}

function pushOneOrArray(target, arg, value)
{
    if (Array.isArray(value))
    {
        for (var i=0; i<value.length; i++)
        {
            target.push(arg);
            target.push(value[i]);
        }
    }
    else
    {
        target.push(arg);
        target.push(value);
    }

}

function mkdirp(targetDir)
{
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    targetDir.split(sep).reduce((parentDir, childDir) => {
      const curDir = path.resolve(parentDir, childDir);
      if (!fs.existsSync(curDir)) {
        fs.mkdirSync(curDir);
      }

      return curDir;
    }, initDir);
}

function rmdir(folder) 
{
    if (fs.existsSync(folder)) 
    {
        fs.readdirSync(folder).forEach(function(file,index)
        {
            var curPath = path.join(folder, file);
            if(fs.lstatSync(curPath).isDirectory()) 
            { 
                rmdir(curPath);
            } 
            else 
            { 
                fs.unlinkSync(curPath);
            }
        });

        fs.rmdirSync(folder);
    }
};

function rm(file)
{
    if (fs.existsSync(file))
        fs.unlinkSync(file);
}

// Get the filetime for a file, or return 0 if doesn't exist
function filetime(filename)
{
	try
	{
		return fs.statSync(filename).mtime.getTime();
	}
	catch (x)
	{
		return 0;
	}
}



// Check if a file is up to date with respect to a set of input files
function isUpToDate(outputFile, inputFiles)
{
	if (action == 'rebuild')
	{
		if (debug)
			console.log(`Forcing update of target file ${outputFile}...`);
		return false;
	}
	
	// Get the target file time
	var targetTime = filetime(outputFile);
	if (targetTime == 0)
	{
		if (debug)
			console.log(`Target file ${outputFile} doesn't exist, needs update...`);

		return false;
	}

	// Any input files?
	if (!inputFiles || inputFiles.length == 0)
		return false;

	// Check each
	for (var f of inputFiles)
	{
		if (filetime(f) > targetTime)
		{
			if (debug)
				console.log(`Target file '${outputFile}' is stale compared to '${f}', needs update...`)
			return false;
		}
	}

	if (debug)
	{
		console.log(`Target file '${outputFile}' is update to date with respect to:`);
		for (var f of inputFiles)
		{
			console.log(`    ${f}`);
		}
	}

	return true;
}


// Run a command
function run(cmd, args, opts)
{
    var opts = merge({
//    	stdio: 'inherit',
		shell: true,
    }, opts);

    if (verbose)
    {
        console.log(`>${cmd} ${args.join(' ')}`);
    }

    // Spawn process
    var r = child_process.spawnSync(cmd, args, opts);

    // Failed to launch
    if (r.error)
    {
		console.log("\nFailed", r.error.message);
		process.exit(7);
    }

    // Failed exit code?
	if (r.status != 0)
	{
		console.log("\nFailed with exit code", r);
		process.exit(7);
	}
}
