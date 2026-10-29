!macro customInstall
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\image\shell\SafeshotGizle" "" "Bilgileri Gizle"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\image\shell\SafeshotGizle" "MUIVerb" "Bilgileri Gizle"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\image\shell\SafeshotGizle" "Icon" "$INSTDIR\Safeshot.exe"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\image\shell\SafeshotGizle" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\image\shell\SafeshotGizle\command" "" '"$INSTDIR\Safeshot.exe" --open "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\image\shell\SafeshotGizle"
!macroend
