# ── DPI Awareness (prevents blurry installer UI on high-DPI screens) ──
ManifestDPIAware true
ManifestDPIAwareness "PerMonitorV2,System"

# ── Override the display name in Add/Remove Programs (remove version suffix) ──
!ifdef UNINSTALL_DISPLAY_NAME
  !undef UNINSTALL_DISPLAY_NAME
!endif
!define UNINSTALL_DISPLAY_NAME "EasyRo"

# ── Desktop shortcut checkbox via Components page ──
!ifndef BUILD_UNINSTALLER

  # Disable description panel on components page
  !define MUI_COMPONENTSPAGE_NODESC

  Section "Desktop Shortcut" SecDesktopShortcut
    SectionIn 1
    CreateShortCut "$DESKTOP\EasyRo.lnk" "$INSTDIR\EasyRo.exe" "" "$INSTDIR\EasyRo.exe" 0
  SectionEnd

  # Hide the main "install" section from components list
  # Section 0 = Desktop Shortcut, Section 1 = main app install
  !macro customInit
    SectionSetText 1 ""
  !macroend

  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE DesktopShortcutLeave
    !insertmacro MUI_PAGE_COMPONENTS

    Function DesktopShortcutLeave
      SectionGetFlags ${SecDesktopShortcut} $0
      IntOp $0 $0 & ${SF_SELECTED}
      ${If} $0 == 0
        StrCpy $R9 "$R9 /no-desktop-shortcut"
      ${EndIf}
    FunctionEnd
  !macroend

!endif
