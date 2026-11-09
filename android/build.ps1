param(
  [Parameter(Mandatory=$true)][string]$Jdk,
  [Parameter(Mandatory=$true)][string]$BuildTools,
  [Parameter(Mandatory=$true)][string]$AndroidJar,
  [Parameter(Mandatory=$true)][string]$BuildDirectory,
  [Parameter(Mandatory=$true)][string]$OutputApk,
  [Parameter(Mandatory=$true)][string]$KeyStore,
  [string]$KeyAlias = 'queyou'
)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$env:JAVA_HOME = $Jdk
$env:PATH = "$Jdk\bin;$env:PATH"
if (-not $env:QUEYOU_KEY_PASSWORD) { throw 'Set QUEYOU_KEY_PASSWORD to your local signing key password.' }
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Build tool failed ($LASTEXITCODE)" } }
New-Item -ItemType Directory -Force -Path $BuildDirectory,"$BuildDirectory\assets","$BuildDirectory\classes","$BuildDirectory\dex" | Out-Null
# aapt2 on Windows cannot reliably read non-ASCII source paths. Stage inputs in the build folder.
Copy-Item -LiteralPath "$PSScriptRoot\res" -Destination $BuildDirectory -Recurse -Force
Copy-Item -LiteralPath "$PSScriptRoot\AndroidManifest.xml" -Destination $BuildDirectory -Force
Copy-Item -LiteralPath "$PSScriptRoot\src\com\queyou\score\MainActivity.java" -Destination $BuildDirectory -Force
foreach($file in @('index.html','styles.css','mobile-v2.css','tiles.js','engine.js','rounds.js','ledger.js','examples.js','guide.js','practice.js','practice-ui.js','app.js','favicon.svg','app-icon.png')) { Copy-Item -LiteralPath "$project\$file" -Destination "$BuildDirectory\assets\$file" -Force }
& "$BuildTools\aapt2.exe" compile --dir "$BuildDirectory\res" -o "$BuildDirectory\resources.zip"
Check-Exit
& "$BuildTools\aapt2.exe" link -o "$BuildDirectory\unsigned.apk" -I $AndroidJar --manifest "$BuildDirectory\AndroidManifest.xml" --min-sdk-version 26 --target-sdk-version 35 -A "$BuildDirectory\assets" "$BuildDirectory\resources.zip"
Check-Exit
& "$Jdk\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -classpath $AndroidJar -d "$BuildDirectory\classes" "$BuildDirectory\MainActivity.java"
Check-Exit
$classFiles = @(Get-ChildItem -LiteralPath "$BuildDirectory\classes" -Filter '*.class' -Recurse | ForEach-Object FullName)
& "$Jdk\bin\java.exe" -cp "$BuildTools\lib\d8.jar" com.android.tools.r8.D8 --release --min-api 26 --lib $AndroidJar --output "$BuildDirectory\dex" @classFiles
Check-Exit
& "$Jdk\bin\jar.exe" uf "$BuildDirectory\unsigned.apk" -C "$BuildDirectory\dex" classes.dex
Check-Exit
& "$BuildTools\zipalign.exe" -f 4 "$BuildDirectory\unsigned.apk" "$BuildDirectory\aligned.apk"
Check-Exit
if (-not (Test-Path -LiteralPath $KeyStore)) {
  & "$Jdk\bin\keytool.exe" -genkeypair -keystore $KeyStore -storepass:env QUEYOU_KEY_PASSWORD -keypass:env QUEYOU_KEY_PASSWORD -alias $KeyAlias -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Queyou Local, OU=Offline, O=Personal, C=CN'
  Check-Exit
}
& "$Jdk\bin\java.exe" -jar "$BuildTools\lib\apksigner.jar" sign --ks $KeyStore --ks-key-alias $KeyAlias --ks-pass env:QUEYOU_KEY_PASSWORD --key-pass env:QUEYOU_KEY_PASSWORD --out $OutputApk "$BuildDirectory\aligned.apk"
Check-Exit
& "$Jdk\bin\java.exe" -jar "$BuildTools\lib\apksigner.jar" verify --verbose $OutputApk
Check-Exit
Write-Output "APK built: $OutputApk"
