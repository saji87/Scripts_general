var child_process = require('child_process');

async function run()
{
    var opts = {
        shell: false,
        cwd: '/usr/bin',
    };
    

    return new Promise((resolve, reject) => {

        // Spawn process
        var child = child_process.spawn('lsx', ['-al'], opts);

        child.on('exit', code => {
            resolve(code);
        });

        child.on('error', err => {
            reject(err);
        });
    
        child.stdout.on('data', function(data) {
            console.log('stdout: ' + data.length);
        });
    
        child.stderr.on('data', function(data) {
            console.log('stderr: ' + data);
        });
    
    });


}

async function test()
{
    try
    {
        var code = await run();
        console.log(`Process exited with ${code}`);
    }
    catch (err)
    {
        console.log("ERROR:", err);
    }

        
    /*
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

    console.log(`Finished with ${r.status}`);
    */
}

test();
