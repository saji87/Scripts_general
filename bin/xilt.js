#!/usr/bin/env node

let child_process = require('child_process');
let path = require('path');
let fs = require('fs');
let os = require('os');
let parseArgs = require('./parseArgs');
let scanDeps = require('./scanDeps');
let parseMessage = require('./parseMessage');

// Work out current folder
let cwd = process.cwd();
let folderName = path.parse(cwd).name;

// ------------ Platform/Environment Checks --------------

// Check supported platform
if (os.platform() != "linux")
{
    console.log("xilt is only supported on Linux");
    process.exit(7);
}

// Find Xilinx tools
let xilinxDir = "/opt/Xilinx/14.7/";
if (!fs.existsSync(xilinxDir))
{
    console.log(`Xilinx tools not found at ${xilinxDir}`);
    process.exit(7);
}
let xilinxBin = path.join(xilinxDir, "ISE_DS/ISE/bin/lin64");

let startTime = Date.now();

function elapsed()
{
    let ms = Date.now() - startTime;
    let seconds = parseInt(ms / 1000);
    let minutes = parseInt(seconds / 60);
    let hours = parseInt(minutes / 60);
    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, 0)}`;
}


// ------------ Settings --------------

let action = "";
let debug = false;
let verbose = false;
let intStyle = "ise";
let filterRules = [];
let settings = {
    projectName: null,
    intDir: null,
    outDir: null,
    device: null,
    topModule: null,
    device: null,
    hdlLanguage: null,
    ucfFile: null,
    filterWarnings: true,
    infoMessages: true,
    msgFormat: "ise",
    depPath: [],
    xstFlags: [],
    ngdBuildFlags: [],
    mapFlags: [],
    parFlags: [],
    bitGenFlags: [],
    sourceFiles: [],
};



// ------------ Main --------------

async function Main()
{
    try
    {
        // Process settings
        processCommandLine(process.argv.slice(2));
        resolveDefaultSettings();
        
        // Invoke selected action
        switch (action)
        {
            case "help":
                showHelp();
                break;

            case "settings":
                console.log(settings);
                break;
                
            case "build":
                await build();
                break;

            case "scandeps":
                var filespecs = settings.sourceFiles.slice();
                if (settings.ucfFile)
                    filespecs.push(settings.ucfFile);
                settings.debug = debug;
                var files = scanDeps(cwd, filespecs, settings);
                for (let i =0; i<files.length; i++)
                {
                    console.log(files[i]);
                }
                break;
        
            case "coregen":
                launchXilinxTool("coregen");
                break;

            case "ise":
                launchXilinxTool("ise");
                break;

            case "xlcm":
                launchXilinxTool("xlcm");
                break;

            default:
                throw new Error(`Unknown action: '${action}'`);
        }
    }
    catch (err)
    {
        console.error(`${err.message}`);
        process.exit(7);
    }
}

// Invoke main
Main();


// ------------ Build Actions ------------

function createDirectories()
{
    // Ensure folders exist
    mkdirp(settings.intDir);
    mkdirp(settings.outDir);
}

async function build()
{
    // Ensure folder exist
    createDirectories();

    // Create XST files
    createXstProjectFile();
    createXstCommandFile(false);

    // Run the build...
    scanForFilterRules()
    await runXst();
    await runNgdBuild();
    await runMap();
    await runPar();
    await runBitGen();

    console.log(`\n[${elapsed()}]: Finished!\n`);
}

function launchXilinxTool(name)
{
    var cp = child_process.spawn("bash", ['-c', `source ${xilinxDir}/ISE_DS/settings64.sh; ${name}`], {detached: true, stdio: 'ignore', shell: false});
    cp.unref();
    console.log(`Launched ${name}`);
}


// ------------ Xilinx Build Actions ------------

let inErrorBlock = false;
let blankLinePending = true;

function is_filtered(message)
{
    for (let r=0; r<filterRules.length; r++)
    {
        if (filterRules[r] instanceof RegExp)
            filtered = !!message.match(filterRules[r]);
        else
            filtered = message.indexOf(filterRules[r]) >= 0;

        if (filtered)
            return true;
    }

    return false;
}

function xilinx_filter(line)
{
    // Parse the message
    let msg = parseMessage(line, settings.sourceFiles);
    if (msg)
    {
        // Filter info messages?
        if (msg.severity == 'info' && !settings.infoMessages)
            return;

        // Filtered?
        if (msg.severity != 'error' && is_filtered(line))
            return;

        // Reformat message?
        if (msg.file)
        {
            switch (settings.messageFormat)
            {
                case "ms":
                case "mscompile":
                    line =`${msg.file}(${msg.line},1) : ${msg.severity} ${msg.code} : ${msg.message}`
                    if (msg.severity != 'error' && is_filtered(line))
                        return;
                    break;

                case "gcc":
                    line = `${msg.file}:${msg.line}:1 ${msg.severity}: ${msg.message}`;
                    if (msg.severity != 'error' && is_filtered(line))
                        return;
                    break;
            }
        }
        
        // Output it
        console.log(line);

        if (msg.tool != "HDLCompiler" && msg.tool != "Xst")
        {
            inErrorBlock = true;
            blankLinePending = false;
        }
        return;
    }

    if (inErrorBlock)
    {
        if (line == '')
        {
            blankLinePending = true;
            return;
        }
        if (line.startsWith(' ') || line.startsWith('\t'))
        {
            if (blankLinePending)
                console.log();

            console.log(line);
            blankLinePending = false;
            return;
        }
    }

    inErrorBlock = false;
    blankLinePending = false;
}

function scanForFilterRules()
{
    if (verbose)
         return;

    for (let i=0; i<settings.sourceFiles.length; i++)
    {
        let ext = path.extname(settings.sourceFiles[i]).toLowerCase();
        if (ext == ".vhdl" || ext == ".vhd")
        {
            var src = fs.readFileSync(settings.sourceFiles[i], "utf8");

            var ruleFinder = /--xilt:nowarn:(.*)/g;
            while (match = ruleFinder.exec(src))
            {
                if (match[1].startsWith("~"))
                {
                    filterRules.push(new RegExp(match[1].substring(1)));
                }
                else
                {
                    filterRules.push(match[1]);
                }
            }
        }
    }
}

async function runXst()
{
    console.log(`[${elapsed()}]: Synthesize...`);

    // Run it
    await run(`${xilinxBin}/xst`, 
        [ 
            "-intstyle", intStyle, 
            "-ifn", `${settings.projectName}.xst`,
            "-ofn", `${settings.projectName}.syr`,
        ],
        {
            cwd: settings.intDir,
        },
        verbose ? null : xilinx_filter
    );
}

async function runNgdBuild()
{
    console.log(`[${elapsed()}]: NGD Build...`);

    let flags = settings.ngdBuildFlags.concat([
        "-intstyle", intStyle, 
        '-uc', path.resolve(settings.ucfFile),
        '-dd', '.',
        '-sd', 'ipcore_dir',
        '-p', settings.device,
        `${settings.projectName}.ngc`,
        `${settings.projectName}.ngd`
    ]);
    

    // Run it
    await run(`${xilinxBin}/ngdbuild`, flags,  
        {
            cwd: settings.intDir,
        },
        verbose ? null : xilinx_filter
    );    
}

async function runMap()
{
    console.log(`[${elapsed()}]: Map...`);

    let flags = settings.mapFlags.concat([
        "-intstyle", intStyle, 
        '-p', settings.device,
        '-o', settings.projectName + "_map.ncd",
        `${settings.projectName}.ngd`,
        `${settings.projectName}.pcf`,
    ]);
    

    // Run it
    await run(`${xilinxBin}/map`, flags,  
        {
            cwd: settings.intDir,
        },
        verbose ? null : xilinx_filter
    );    
}


async function runPar()
{
    console.log(`[${elapsed()}]: Place and Route...`);

    let flags = settings.parFlags.concat([
        "-intstyle", intStyle, 
        `${settings.projectName}_map.ncd`,
        `${settings.projectName}.ncd`,
        `${settings.projectName}.pcf`,
    ]);

    // Run it
    await run(`${xilinxBin}/par`, flags,  
        {
            cwd: settings.intDir,
        },
        verbose ? null : xilinx_filter
    );    
}


async function runBitGen()
{

    console.log(`[${elapsed()}]: BitGen...`);

    let outputFile = path.join(settings.outDir, settings.projectName + ".bit")
    let flags = settings.bitGenFlags.concat([
        "-intstyle", intStyle, 
        `${settings.projectName}.ncd`,
        `${path.resolve(outputFile)}`,
        `${settings.projectName}.pcf`,
    ]);

    // Run it
    await run(`${xilinxBin}/bitgen`, flags,  
        {
            cwd: settings.intDir,
        },
        verbose ? null : xilinx_filter
    );    
}

// ------------ XST --------------

function createXstProjectFile()
{
    let sb = "";
    for (let i=0; i<settings.sourceFiles.length; i++)
    {
        let file = path.resolve(settings.sourceFiles[i]);
        let ext = path.extname(settings.sourceFiles[i]);

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

function createXstCommandFile(elaborate)
{
    let sb = "";
    sb += `set -tmpdir .\n`;
    sb += `set -xsthdpdir "xst"\n`;
    sb += elaborate ? `elaborate\n` : `run\n`;
    sb += `-ifn "${settings.projectName}.prj"\n`;
    sb += `-ifmt mixed\n`;
    if (!elaborate)
    {
        sb += `-ofn "${settings.projectName}"\n`;
        sb += `-ofmt NGC\n`
        sb += `-top ${settings.topModule}\n`;
        sb += `-p ${settings.device}\n`;
        sb += `-opt_mode Speed\n`;
        sb += `-opt_level 1\n`;
    }
    fs.writeFileSync(path.join(settings.intDir, settings.projectName + ".xst"), sb);
}



// ------------ Command Line Parse --------------

function processCommandLine(argv)
{
	for (let i=0; i<argv.length; i++)
	{
        let a = argv[i];
        
        // Response file?
        if (a.startsWith("@"))
        {
            var responseFile = a.substring(1);
            if (fs.existsSync(responseFile))
            {
                var content = fs.readFileSync(responseFile, 'UTF8');                
                processCommandLine(parseArgs(content));
            }
            else
            {
                throw new Error(`Response file ${responseFile} not found`);
            }
            continue;
        }

		let isSwitch = false;
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
            let parts = a.split(':');
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

                case "deppath":
                    if (parts.length < 2)
                        throw new Error("depPath argument missing");
                    settings.depPath.push(parts[1]);
                    break;

                case "nofilter":
                    settings.filterWarnings = false;
                    break;

                case "noinfo":
                    settings.infoMessages = false;
                    break;

                case "messageformat":
                    if (parts[1].toLowerCase() != "ise" &&
                        parts[1].toLowerCase() != "gcc" && 
                        parts[1].toLowerCase() != "mscompile" && 
                        parts[1].toLowerCase() != "ms")
                        throw new Error(`unknown message format '${parts[1]}'`);
                    
                    settings.messageFormat = parts[1].toLowerCase();
                    break;

                case "help":
                    showHelp();
                    process.exit(0);
                    break;

                default:
                    throw new Error(`Unrecognized switch: --${parts[0]}`)
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




function resolveDefaultSettings()
{
    if (!settings.projectName)
        settings.projectName = folderName;
    if (!settings.topModule)
        settings.topModule = settings.projectName;
    if (!settings.ucfFile && action != "scandeps")
        settings.ucfFile = settings.projectName + ".ucf";
    if (!settings.hdlLanguage)
        settings.hdlLanguage = "VHDL";
    if (!action)
        action = "help";
    if (!settings.intDir)
        settings.intDir = "./build";
    if (!settings.outDir)
        settings.outDir = settings.intDir;
}

// ------------ Help --------------

function showHelp()
{
    console.log("xilt - Xilinx Command Line Tools");
    console.log("Copyright (C) 2019 Topten Software.  All Rights Reserved");
    console.log();
    console.log("USAGE: xilt action [Options] [SourceFiles] [UCFFile]");
    console.log();
    console.log("Actions:");
    console.log("    build                   build the project");
    console.log("    settings                show all resolved build settings");
    console.log("    scandeps                scan for dependencies");
    console.log("    ise                     launch Xilinx ISE");
    console.log("    coregen                 launch Xilinx Core Generator");
    console.log("    xlcm                    launch Xilinx license manager");
    console.log("    help                    show this help");
    console.log();
    console.log("Options:");
    console.log("    --debug                 show file dependency checks");
    console.log("    --device:val            set the Xilinx device name (required)");
    console.log("    --help                  show this help");
    console.log("    --depPath:val           set a folder to search for dependencies"),
    console.log("    --intDir:val            set the intermediate build directory (default: ./build");
    console.log("    --outDir:val            set the output folder for .bit file (default: intermediate directory)");
    console.log("    --projectName:val       set the name of the project (default: folder name)");
    console.log("    --topModule:val         set the name of the top module (default: project name)");
    console.log("    --nofilter              disable filtering of warnings");
    console.log("    --messageFormat:val     reformat errors and warnings to 'mscompile' or 'gcc' format");
    console.log("    --verbose               show verbose output");
    console.log();
    console.log("Xilinx Tools Passthrough:")
    console.log("    --xst_<name>[:val]      sets additional arguments to pass to xst");
    console.log("    --ngcbuild_<name>[:val] sets additional arguments to pass to ngdbuild");
    console.log("    --map_<name>[:val]      sets additional arguments to pass to map");
    console.log("    --par_<name>[:val]      sets additional arguments to pass to par");
    console.log("    --bitgen_<name>[:val]   sets additional arguments to pass to bitgen");
    console.log("");
    console.log("eg: '--bitgen_g:StartupClk:CCLK' will invoke bitgen with '-g StartupClk:CCLK'");
}

// ------------ Utility Functions --------------



function merge(x, y)
{
    if (!y)
        return x;

    let keys = Object.keys(y);
    for (let i=0; i<keys.length; i++)
    {
        x[keys[i]] = y[keys[i]];
    }

    return x;
}

function mergeMissing(x, y)
{
    if (!y)
        return x;

    let keys = Object.keys(y);
    for (let i=0; i<keys.length; i++)
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
        let options = JSON.parse(fs.readFileSync(file, 'UTF8'));

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
        for (let i=0; i<value.length; i++)
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
            let curPath = path.join(folder, file);
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





// Run a command
async function run(cmd, args, opts, stdioCallback)
{
    if (verbose)
    {
        console.log(`>${cmd} ${args.join(' ')}`);
    }

    // Merge options
    opts = merge({
		shell: true,
    }, opts);

    // Inherit stdio or filter it?
    if (!stdioCallback)
    {
        opts.stdio = 'inherit';
    }

    var sb = "";
    function stdio(data)
    {
        sb += data;
        while (true)
        {
            let nlPos = sb.indexOf('\n');
            if (nlPos < 0)
                break;

            stdioCallback(sb.substring(0, nlPos));
            sb = sb.substring(nlPos+1);
        }
    }

    function stdflush()
    {
        if (sb.length > 0)
        {
            stdioCallback(sb);
            sb = "";
        }
    }

    return new Promise((resolve, reject) => {

        // Spawn process
        var child = child_process.spawn(cmd, args, opts);

        child.on('exit', code => {
            stdflush();
            if (code == 0)
                resolve(code);
            else
                reject(new Error(`FAILED: ${path.basename(cmd)} with exit code ${code}\n`));
        });

        child.on('error', err => {
            stdflush();
            reject(err);
        });
    
        if (stdioCallback)
        {
            child.stdout.on('data', stdio);
            child.stderr.on('data', stdio);
        }
    });
}


/*
wget https://raw.githubusercontent.com/numato/samplecode/master/FPGA/MimasV2/tools/configuration/python/MimasV2Config.py
sudo apt-get install python3-pip
python3 -m pip install pyserial


See: https://ewen.mcneill.gen.nz/blog/entry/2017-03-06-numato-mimas-v2-from-linux/

See: https://github.com/jimmo/numato-mimasv2-pic-firmware

See: https://community.numato.com/attachments/firmwaredownloader-zip.18/

See: https://community.numato.com/attachments/miamsv2-115200-zip.28/

ls /dev > notplugged
# plug in device
ls /dev > plugged
diff notplugged plugged
*/