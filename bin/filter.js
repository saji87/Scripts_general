let fs = require('fs');
let path = require('path');

let lines = fs.readFileSync('../xst.log', 'utf8').split('\n');

let relBase = "/home/brad/Projects/fpgabee3/Hardware/PapilioDuo";
let curUnit;
var unitToFileMap = {};

for (let i=0; i<lines.length; i++)
{
    let line = lines[i];

    let match = line.match(/^(WARNING)\:(.*?) - \"(.*?)\" Line (\d+)(?:\:|\.) (.*?)$/i);
    if (match)
    {
        let relPath = path.relative(relBase, match[3]);
        console.log(`${relPath}(${match[4]}): ${match[1].toLowerCase()}:${match[2].toLocaleLowerCase()}: ${match[5]}`);
        continue;
    }

    match = line.match(/^(WARNING)\:(.*)/i);
    if (match)
    {
        var unit = curUnit;
        if (!unit)
        {
            var match2 = line.match(/in (Unit|Block) \<(.*?)\>/i);
            if (match2)
                unit = match2[2];
        }

        if (unitToFileMap[unit])
        {
            console.log(`${unitToFileMap[unit]}: ${line}`);
        }
        else
        {
            console.log(line);
        }
    }

    // Detect start of synthesizing a unit
    match = line.match(/^Synthesizing Unit \<(.*)\>.$/);
    if (match)
    {
        curUnit = match[1];
        continue;
    }

    // Detach end of synthesizing a unit
    match = line.match(/^Unit \<(.*)\> synthesized.$/);
    if (match)
    {
        curUnit = null;
        continue;
    }

    // Detect start of synthesizing a unit
    match = line.match(/^Synthesizing \(advanced\) Unit \<(.*)\>.$/);
    if (match)
    {
        curUnit = match[1];
        continue;
    }

    // Detach end of synthesizing a unit
    match = line.match(/^Unit \<(.*)\> synthesized \(advanced\).$/);
    if (match)
    {
        curUnit = null;
        continue;
    }

    // Remember the source file associated with each unit
    match = line.match(/Related source file is \"(.*)\"./);
    if (match)
    {
        unitToFileMap[curUnit] = path.relative(relBase, match[1]);
        continue;
    }

}

