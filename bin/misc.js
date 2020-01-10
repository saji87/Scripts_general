const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

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

// Run a command
async function run(cmd, args, opts, stdioCallback)
{
    // Merge options
    opts = merge({
		shell: true,
    }, opts);

    // Inherit stdio or filter it?
    if (!stdioCallback)
    {
        opts.stdio = 'inherit';
    }

    let sb = "";
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
        let child = child_process.spawn(cmd, args, opts);

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

function smartJoin(a, b)
{
    if (b.startsWith("//"))
    {
        // Find the root .git folder
        let base = process.cwd();

        while (true)
        {
            // .git exist here?
            if (fs.existsSync(path.join(base, ".git")))
                return path.join(base, b.substring(2));

            if (base.length <= 1)
                break;

            // Move to parent directory
            base = path.dirname(base);
        }

        throw new Error(`Can't find .git root from ${process.cwd()}`);
    }

    if (b.startsWith("/"))
        return b;
    else
        return path.join(a, b);
}




module.exports = {
    merge,
    run,
    mkdirp,
    rmdir,
    rm,
    filetime,
    smartJoin
}