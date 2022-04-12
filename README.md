# Scripts_general
General purpose scripts for automation and installations
1. xilsetup script from Xilinx ise installation webpage
      https://www.toptensoftware.com/blog/the-ultimate-xilinx-ise-14-7-setup-guide/
      $ wget https://bitbucket.org/toptensoftware/xilsetup/raw/master/xilsetup
      $ chmod +x xilsetup
      $ sudo ./xilsetup --step1
      $ sudo ./xilsetup --step2 --no-opera
 If you've already have the installer downloaded you can just copy it to your ~/Downloads folder and the script will pick it up from there.  The file that's needed is Xilinx_ISE_DS_Lin_14.7_1015_1.tar.

a. $ xilt ise  / xilt coregen

b. $ mkdir Projects
$ cd Projects
$ git clone https://github.com/toptensoftware/fpgakit.git
$ cd fpgakit/sims/07-reflector-rx
$ make view

c.
$ cd ~/Projects/
$ cd fpgakit/boards/mimasv2/01-switches-leds
$ make


README repo : https://www.npmjs.com/package/xilt
