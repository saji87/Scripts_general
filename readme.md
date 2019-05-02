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

    npm install -g xilt

(Requires Node 8 or later)

## Building with Xilt

To build a project, run `xilt build` or `xilt rebuild` specifying the following options (most optional) and a list of vhdl, verilog files (and one .ucf file)

* `--device:val`            set the Xilinx device name (required)
* `--intDir:val`            set the intermediate build directory (default: ./build)
* `--outDir:val`            set the output folder for .bit file (default: intermediate directory)
* `--projectName:val`       set the name of the project (default: folder name)
* `--topModule:val`         set the name of the top module (default: project name)

eg:

    xilt build --device:xc6slx9-2-tqg144 myproj.vhd myproj.ucf

You can also use `xilt clean` to delete the intermediate output files and the final .bit file.

## Passing Arguments to Xilinx Toolchain

To pass arguments to the underlying tools invoked by xilt, specify those options by prefixing them with the tool name:


* `--xst_<name>[:val]`      sets additional arguments to pass to xst
* `--ngcbuild_<name>[:val]` sets additional arguments to pass to ngdbuild
* `--map_<name>[:val]`      sets additional arguments to pass to map
* `--par_<name>[:val]`      sets additional arguments to pass to par
* `--bitgen_<name>[:val]`   sets additional arguments to pass to bitgen

For example to invoke  bitgen with `-g StartupClk:CCLK` use:

    --bitgen_g:StartupClk:CCLK'
    

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
