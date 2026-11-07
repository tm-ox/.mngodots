# Usage: affinity-wine-theme.py dark|light <font-px>  (dark also applies the dark colour scheme). Needs Affinity restarted.
# Original Wine fonts were 8px (caption 10); 10 is the chosen size. Revert: restore user.reg backup or set fonts back.
import struct, subprocess, os, sys
env=dict(os.environ, WINEPREFIX=os.path.expanduser("~/Applications/affinity-suite"), WINEDEBUG="-all")
W=os.path.expanduser("~/.local/share/lutris/runners/wine/ElementalWarriorWine-x86_64/bin/wine")
def reg(key,name,typ,val): subprocess.run([W,"reg","add",key,"/v",name,"/t",typ,"/d",val,"/f"],env=env,check=True,capture_output=True)
def lf(h,weight=400,face="Tahoma"):
    b=struct.pack("<lllllBBBBBBBB",h,0,0,0,weight,0,0,0,1,0,0,0,0)
    b+=face.encode("utf-16le").ljust(64,b"\0")
    return b.hex()
dark=sys.argv[1]=="dark"
C="HKCU\\Control Panel\\Colors"
if dark:
    cols={"Window":"32 33 36","WindowText":"232 232 232","ButtonFace":"48 50 55","ButtonText":"232 232 232","ButtonHilight":"80 82 88","ButtonLight":"64 66 72","ButtonShadow":"24 25 28","ButtonDkShadow":"16 16 18","ButtonAlternateFace":"40 42 46","Menu":"40 42 46","MenuText":"232 232 232","MenuBar":"40 42 46","MenuHilight":"70 110 180","Highlight":"70 110 180","HighlightText":"255 255 255","GrayText":"140 140 145","InfoWindow":"48 50 55","InfoText":"232 232 232","Scrollbar":"48 50 55","ActiveBorder":"48 50 55","InactiveBorder":"48 50 55","AppWorkSpace":"32 33 36","ActiveTitle":"48 50 55","InactiveTitle":"40 42 46","TitleText":"232 232 232","InactiveTitleText":"140 140 145","HotTrackingColor":"110 160 240"}
    for k,v in cols.items(): reg(C,k,"REG_SZ",v)
M="HKCU\\Control Panel\\Desktop\\WindowMetrics"
size=int(sys.argv[2])
for n in ("MessageFont","MenuFont","StatusFont","IconFont"): reg(M,n,"REG_BINARY",lf(size))
reg(M,"CaptionFont","REG_BINARY",lf(size,700))
reg(M,"SmCaptionFont","REG_BINARY",lf(size))
