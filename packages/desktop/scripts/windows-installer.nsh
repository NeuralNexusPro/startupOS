; electron-builder's update uninstaller uses --updated, which atomically moves
; every file out of INSTDIR. If that path fails with exit code 2, retry the
; installed uninstaller in its ordinary silent mode. Never skip uninstallation
; or remove registry entries to make an upgrade appear successful.
!ifndef BUILD_UNINSTALLER
!macro originosHandleUninstallResult
  ${if} $R0 == 2
    ${andIf} ${FileExists} "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe"
      DetailPrint "OriginOS CE: retrying old uninstaller without --updated"
      ClearErrors
      ExecWait '"$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe" /S /KEEP_APP_DATA _?=$INSTDIR' $R0
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
