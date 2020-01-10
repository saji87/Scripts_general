# Xilt - Command Line Tools for Xilinx Toolchain

Xilt is a command line tool for building Xilinx FPGA projects from the command line.

## Overview

Xilt assumes Xilinx ISE WebPack 14.7 is installed and only works on 64-bit Linux systems (this is a deliberate
design decision since the ISE isn't officially supported on current versions of Windows).

Xilt can be used to:

* Build VHDL, Verilog and mixed mode FPGA projects.
* Runs xst, ngdbuild, map, par and bitgen all from one command invocation.
* Filters output to show errors and warnings while suppressing all other messages (these can be reviewed later in log if necessary).
* Launch common Xilinx GUI tools (ISE, CoreGen and License Manager) without having to explicitly setup ISE environment paths.
* Build places all intermediate files into a separate folder to keep your source folders clean.

## Installation

Install with:

    sudo npm install -g xilt

(Requires Node 8 or later)

## Building with Xilt

To build a project, run `xilt build` or specifying the following options (most optional) and a list of vhdl, verilog files (and one .ucf file)

* `--device:val`            set the Xilinx device name (required)
* `--intDir:val`            set the intermediate build directory (default: ./build)
* `--outDir:val`            set the output folder for .bit file (default: intermediate directory)
* `--projectName:val`       set the name of the project (default: folder name)
* `--topModule:val`         set the name of the top module (default: project name)

eg:

    xilt build --device:xc6slx9-2-tqg144 myproj.vhd myproj.ucf

## Passing Arguments to Xilinx Toolchain

To pass arguments to the underlying tools invoked by xilt, specify those options by prefixing them with the tool name:


* `--xst_<name>[:val]`      sets additional arguments to pass to xst
* `--ngcbuild_<name>[:val]` sets additional arguments to pass to ngdbuild
* `--map_<name>[:val]`      sets additional arguments to pass to map
* `--par_<name>[:val]`      sets additional arguments to pass to par
* `--bitgen_<name>[:val]`   sets additional arguments to pass to bitgen

For example to invoke  bitgen with `-g StartupClk:CCLK` use:

    --bitgen_g:StartupClk:CCLK
    
## Response Files

You can pass additional command line arguments via a response file.  A response file
is a simple text file that lists out additional command line options.  To reference
a response file on the command line, preceeed the file name with an `@` symbol.

Response files are a great way to collect all the settings required for a particular
FPGA board into one central location.  eg: the following will load additional command 
line arguments from the file `./boards/mimasv2-xilt/txt`.

```
xilt build --projectName:blah @./boards/mimasv2-xilt.txt 
```

The `mimasv2-xilt.txt` can contain all the require Xilinx command line switches 
required for that board:

```
--device:xc6slx9-2-CSG324
--map_w
--par_w
--bitgen_w
--bitgen_g:Binary:yes
... etc ... etc ...
```


## Dependency Scanning

Xilt includes a simple dependency scanning capability that assumes the names
of VHDL entities and packages are located in files with the same name as the
required entity/package.

eg: 

Suppose you had an entity named `SevenSegmentHexDisplay` that was referenced
in your `top.vhd` file like so

```vhdl
	-- Use an instance of the SevenSegmentHexDisplay component
	display : entity work.SevenSegmentHexDisplay
	PORT MAP 
	(
        -- etc..
    )
```

and suppose all your shared components like this reside in folder at `../components`
then running the following command:

```
xilt scandeps *.vhd *.ucf --deppath:../components
```

should find all the required files and output something like this:

```
top.vhd
myproject.ucf
../components/SevenSegmentHexDisplay.vhd
```

Note that if SevenSegmentHexDisplay entity also referenced other entities, the 
scandep function would also try to locate those.

Dependency scanning is a simple regex search and looks for `entity` and `use` 
statements the use components from the `work` library.  

You can also explicitly declare a required file with a comment of the form:

```
--xilt:require:../lib/somefolder/my_oddly_named_component.vhd
```

Dependency scanning is completely separate from the build process and 
is intended to be used by a make file to build a list of input files to the build
(which would then be passed back to xilt to do the actual build).


## Suppressing Warnings

Xilt can suppress warnings that have been deemed to be benign.  To suppress
a warning, include a comment of the following form in any of the VHDL source 
files.

~~~
--xilt:nowarn:<text>
~~~

or

~~~
--xilt:nowarn:~<regexp>
~~~

Any warning messages that match the text or regular expression will be suppressed
from the stdout.  The messages will still be included in the report files.

Note that any directives to suppress warnings apply to all source files being
compiled - not just the file in which they appear.  Be careful to not suppress 
warnings you don't intend by including specific details from the warning  such 
as the block and the signal name.

Periodically you should check the full reports for warnings, or use the --nofilter
command line switch to disable this feature and report all warnings.

The following are some common benign warnings you might like to suppress globally.

~~~
-- Input <X> is never used. This port will be preserved and left unconnected if it 
-- belongs to a top-level block or it belongs to a sub-block and the hierarchy of this 
-- sub-block is preserved.
--xilt:nowarn:~^WARNING:Xst:647

-- FF/Latch <X> (without init value) has a constant value of <Y> in block <Z>. 
-- This FF/Latch will be trimmed during the optimization process.
--xilt:nowarn:~^WARNING:Xst:1710

-- Due to other FF/Latch trimming, FF/Latch <X> (without init value) has a constant
-- value of Y in block <Z>. This FF/Latch will be trimmed during the optimization process.
--xilt:nowarn:~^WARNING:Xst:1895

-- FFs/Latches <o_sd_op_cmd<1:1>> (without init value) have a constant value of <X> in 
-- block <Y>.
--xilt:nowarn:~^WARNING:Xst:2404

-- Node <X> of sequential type is unconnected in block <Y>.
--xilt:nowarn:~^WARNING:Xst:2677

-- WARNING:PhysDesignRules:2410 - This design is using one or more 9K Block RAMs
--   (RAMB8BWER).  9K Block RAM initialization data, both user defined and
--   default, may be incorrect and should not be used.  For more information,
--   please reference Xilinx Answer Record 39999.
--xilt:nowarn:~^WARNING:PhysDesignRules:2410
~~~

## Message Reformatting

Xilt can reformat Xilinx error, warning and informational messages into a more commonly
used formats with the `--messageFormat:val` command line switch.    This can make 
it easier to integrate with editor problem matchers.

Available formats include:

* `ms` | `msCompile` - Microsoft compiler error format (works with $msCompile problem match in VS Code)
* `gcc` - The gcc compiler error format (works with $gcc problem matcher in VS Code if installed).

Also, when messages are reformatted xilt tries to locate various signals, entities etc... in the input source files to provide file and line number information for 
many messages that the Xilinx tools don't normally provide.  This depends on the
unit/block/entity names matching the name of the file they're declared in and uses
a simple regex to locate the signal/port being referenced.

If message filtering is being used (see above), the filters are matched against both
the original message string and the reformatted message.

## Message Reformatting for GHDL

Similarly to the message filtering for the Xilinx tools described above, xilt can
also filter the messages fom GHDL and reformat them into $msCompile format.

```
xilt ghdl-filter [ghdl command line]
```

There are no other command line options to the action and you must include the ghdl
command (including its full path if not on system path) on the command line.

## GIT Root Paths

Sometimes it's handy to reference files relative to the root of the project workspace.

To support this, most filenames and paths handled by xilt can use the special double
slash file prefix to mean the project root - which is determined by walking the parent
directory chain from the current directory until a .git folder is found.

eg: suppose you have this project structure

~~~
$/Projects/MyProject/
    .git
    shared/
    Project1/
    Project2/
        part1
        part2
~~~

Using the path `//shared` will work from within any of the project sub-folders such as
`/Project1` and `/Project2/part1/`.

## Launching Xilinx GUI Tools

To launch Xilinx GUI Tools, use `xilt <toolname>`.

* `xilt coregen`                 launch Xilinx Core Generator
* `xilt ise`                     launch Xilinx ISE
* `xilt xlcm`                    launch Xilinx license manager


## Other

Other command line options include:

* `--debug` Logs file dependency checks
* `--verbose` Displays lots of output and disables default output filtering
* `--help` Displays help
* `--deppath` Sets a path to be searched for dependency files
* `--nofilter` Ignores all `--xilt:nowarn` directives
* `--messageFormat:msCompile|gcc|ise` Reformats messages to Microsoft of GCC message format
