; electron-builder's update uninstaller uses --updated, which atomically moves
; every file out of INSTDIR. If that path fails with exit code 2, retry the
; installed uninstaller in its ordinary silent mode. Never skip uninstallation
; or remove registry entries to make an upgrade appear successful.
!ifndef BUILD_UNINSTALLER
!macro originosHandleUninstallResult
  ${if} $R0 == 2
    ${andIf} $uninstallerFileName != ""
    ${andIf} ${FileExists} "$uninstallerFileNameTemp"
      ${if} $rootKey_uninstallResult == "HKEY_CURRENT_USER"
      ${orIf} $installMode == "CurrentUser"
        StrCpy $1 "/currentuser"
      ${else}
        StrCpy $1 "/allusers"
      ${endif}
      DetailPrint "OriginOS CE: retrying old uninstaller without --updated"
      ClearErrors
      ExecWait '"$uninstallerFileNameTemp" /S /KEEP_APP_DATA $1 _?=$installationDir' $R0
      ; Ordinary uninstall removes shortcuts; the new installer must recreate them.
      ${if} $R0 == 0
        StrCpy $keepShortcuts "false"
      ${endif}
  ${endif}

  IfErrors 0 +3
  DetailPrint "Uninstall was not successful. Not able to launch uninstaller!"
  Return

  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint "Uninstall was not successful. Uninstaller error code: $R0."
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customUnInstallCheck
  !insertmacro originosHandleUninstallResult
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro originosHandleUninstallResult
!macroend
!endif
