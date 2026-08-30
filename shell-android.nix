let
  pkgs = import <nixpkgs> {};
  glibc = pkgs.glibc;
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    flutter
    androidsdk
    androidsdk.platform-tools
    androidsdk.build-tools_33_0_0
    openjdk11
    patchelf
  ];

  shellHook = ''
    export NIX_LD=${glibc}/lib/ld-linux-x86-64.so.2
    export LD_LIBRARY_PATH=${glibc}/lib:$LD_LIBRARY_PATH
    export ANDROID_SDK_ROOT=${pkgs.androidsdk}
    echo "NIX_LD set to $NIX_LD"
  '';
}
