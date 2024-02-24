// Importer des libs
const NodeWebcam = require("node-webcam")
const fetch = require("node-fetch")
const fs = require("fs")
const path = require("path")
const Jimp = require("jimp")
const sizeOf = require("image-size")
const fastify = require("fastify")({ logger: { level: "silent" } })
const childProcess = require("child_process")
const CronJob = require("cron").CronJob
const WebSocket = require("ws")
const terminate = require("terminate")
require("dotenv").config()

// ElectronJS
const electron = require("electron")
var BrowserWindow = require("electron").BrowserWindow

// Si l'appli est déjà ouverte en arrière plan, on la focus
const gotTheLock = electron.app.requestSingleInstanceLock()
if(!gotTheLock){
	electron.app.quit()
} else {
	// On focus la fenêtre si on reçoit une seconde instance
	electron.app.on("second-instance", () => {
		if(window){
			console.log("Already running, focusing...")
			setTimeout(() => window.show(), 400)
		}
	})
}

// Variables
var shouldDetectBrightness = true
var window

// Créer un dossier temporaire
if(!fs.existsSync(path.join(__dirname, "temp"))) fs.mkdirSync(path.join(__dirname, "temp"))

// Fonction principale
async function main(){
	// On crée la fenêtre
	window = new BrowserWindow({
		title: "InfoScreen",
		webPreferences: {
			webviewTag: true,
			nodeIntegration: true,
			contextIsolation: false
		},
		movable: true,
		minimizable: true,
		maximizable: true,
		fullscreen: true,
		show: true
	})
	window.loadFile(path.join(__dirname, "src", "index.html"))

	// Quand la fenêtre a chargé, on envoie des variables d'environnement
	window.webContents.on("did-finish-load", () => {
		window.webContents.send("dotenv", { key: "SPOTIFY_MINIPLAYER", value: process.env.SPOTIFY_MINIPLAYER })
		window.webContents.send("dotenv", { key: "HA_DASHBOARD", value: process.env.HA_DASHBOARD })
	})
}

// Quand Electron est prêt, on lance la fonction principale
electron.app.whenReady().then(async () => {
	main()

	electron.app.on("activate", () => { // nécessaire pour macOS
		if(BrowserWindow.getAllWindows().length === 0) main()
	})
})

// Tous les matins à 4h
CronJob.from({
	cronTime: "0 4 * * *",
	onTick: async () => {
		// Si on a des infos manquantes
		if(!process.env.PRONOTE_URL || !process.env.PRONOTE_USERNAME || !process.env.PRONOTE_PASSWORD || !process.env.PAPILLON_API_URL) return console.log("Infos manquantes pour obtenir l'emploi du temps Pronote")

		// Générer un token de connexion à Pronote
		var token = await fetch(`${process.env.PAPILLON_API_URL}/generatetoken`, {
			method: "POST",
			body: JSON.stringify({
				url: process.env.PRONOTE_URL,
				username: process.env.PRONOTE_USERNAME,
				password: process.env.PRONOTE_PASSWORD,
				ent: process.env.PRONOTE_CAS
			}),
			headers: { "Content-Type": "application/json" }
		}).then(res => res.json()).catch(err => { return { error: err } })
		if(token.error) return console.log("Impossible de générer un token de connexion à Pronote:", token.error)
		else token = token.token

		// Obtenir l'emploi du temps pour la journée
		var timetable = await fetch(`${process.env.PAPILLON_API_URL}/timetable?dateString=${new Date().toISOString().slice(0, 10)}&token=${token}`).then(res => res.json()).catch(err => { return { error: err } })
		if(timetable.error) return console.log("Impossible d'obtenir l'emploi du temps:", timetable.error)
		else timetable = timetable.filter(e => e.start && e.end && !e.is_cancelled && !e.is_exempted).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()).filter(e => new Date(e.start).getTime() > new Date().getTime())

		// Si on a aucun cours, on ne fait rien, sinon on l'envoie également à la fenêtre
		if(timetable.length == 0) return console.log("Aucun cours aujourd'hui")
		else window.webContents.send("timetable", timetable)
	},
	start: true,
	timeZone: "Europe/Paris"
})

// Obtenir la météo toutes les heures
CronJob.from({
	cronTime: "0 * * * *",
	onTick: async () => {
		// Obtenir la météo, et vérifier qu'on l'a bien eu
		var weather = await fetch(`https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_KEY}&q=${encodeURIComponent(process.env.WEATHER_QUERY)}&lang=en`).then(res => res.json()).catch(err => { return { error: true, message: err } })
		if(!weather?.current) return console.error("Impossible d'avoir la météo:", weather?.error?.message || weather?.message || weather?.error || weather)

		// Envoyer à la fenêtre
		console.log("Météo:", weather.current || weather)
		window.webContents.send("weather", weather.current)
	},
	start: true,
	timeZone: "Europe/Paris"
})

// Récupérer le niveau de batterie
setInterval(async () => {
	// Obtenir le niveau de batterie
	var battery
	try {
		battery = childProcess.execSync("upower -i `upower -e | grep 'BAT'` | grep 'percentage:'").toString().trim().replace(/[^0-9]/g, "")
		battery = parseInt(battery)
	} catch(err){ console.error("Impossible d'obtenir le niveau de batterie:", err) }

	// Si la batterie est inférieure à 35%, on envoie le niveau, sinon, on envoie "hide"
	if(battery) window.webContents.send("battery", battery < 35 ? battery : "hide")
}, 60 * 1000)

// Se connecter au WebSocket pour obtenir l'heure du BeReal
var ws = new WebSocket("ws://46.105.30.166:3910")
ws.on("open", () => console.log("Connecté au WebSocket BeReal"))
ws.on("message", (data) => {
	console.log(JSON.stringify(data))
	if(data == "bereal") window.webContents.send("notification", { title: "BeReal", content: "C'est l'heure du BeReal !", iconPath: "img/bereal.png", timeout: 100000 })
})
ws.on("error", async (err) => {
	console.error("Impossible de se connecter au WebSocket BeReal:", err)
	console.log("Nouvelle tentative dans 30 secondes...")
	await new Promise((resolve) => setTimeout(resolve, 30 * 1000))
	ws = new WebSocket("ws://46.105.30.166:3910")
})

// Servir une route qui permet de changer l'état des détections de luminosité et de l'écran
fastify.get("/change", async (req, res) => {
	// Obtenir l'état à définir
	var state = req.query.state
	if(state != "true" && state != "false") return res.code(400).send("Bad Request")

	// Définir l'état
	console.log(`Changement de l'état des détections via une requête: ${state == "true" ? "Activé" : "Désactivé"}`)
	shouldDetectBrightness = state == "true"

	// Eteindre l'écran si on doit pas détecter la luminosité
	if(!shouldDetectBrightness) changeBrightness(0)
	else executeBrightnessDetection()

	// Retourner une réponse
	res.code(200).send("OK")
})

// Servir une route qui permet de revérifier la luminosité via la caméra si l'écran est allumé
fastify.get("/recheck", async (req, res) => {
	console.log("Nouvelle vérification de la luminosité via une requête.")
	if(shouldDetectBrightness) executeBrightnessDetection()
	res.code(200).send("OK")
})

// Servir une route qui permet de faire un deuxième écran à partir de mon PC (avec Deskreen)
var pcMonitorWindow
fastify.post("/pcmonitor", async (req, res) => {
	// Obtenir l'URL de l'écran à afficher
	var url = req.body?.url

	// Si on a pas d'URL, on ferme la fenêtre existante
	if(!url && pcMonitorWindow){
		await pcMonitorWindow.close()
		pcMonitorWindow = null
	}

	// Si on a une URL, on ouvre une nouvelle fenêtre
	if(url){
		// On ferme la fenêtre existante
		if(pcMonitorWindow){
			await pcMonitorWindow.close()
			pcMonitorWindow = null
		}

		// On ouvre la nouvelle fenêtre
		pcMonitorWindow = new BrowserWindow({
			title: "PC Monitor",
			webPreferences: { contextIsolation: true, preload: path.join(__dirname, "src", "js", "preload_deskreen.js") },
			movable: true,
			minimizable: true,
			maximizable: true,
			fullscreen: true,
			show: true
		})
		pcMonitorWindow.loadURL(url)
	}

	// Retourner une réponse
	return res.code(200).send("OK")
})

// Servir une route qui permet d'activer ou désactiver le mode surveillance de la caméra
var cameraChildProcess
if(process.env.VIDEO_DEVICE) fastify.get("/camera", async (req, res) => {
	// Obtenir l'état à définir
	var state = req.query.state
	if(state != "true" && state != "false") return res.code(400).send("Bad Request")

	// Définir l'état
	console.log(`Changement de l'état de la caméra via une requête: ${state == "true" ? "Activé" : "Désactivé"}`)
	window.webContents.send("camera", state == "true")

	// Si on veut activer la caméra mais qu'elle est déjà active, on annule
	if(state == "true" && cameraChildProcess) return res.code(200).send("OK")

	// Activer la caméra
	if(state == "true"){
		cameraChildProcess = childProcess.exec(process.env.CAMERA_COMMAND)
		cameraChildProcess.stdout.on("data", (data) => console.log("[CAMERA]", data))
		cameraChildProcess.stderr.on("data", (data) => console.error("[CAMERA]", data))

		console.log("⚠️ Caméra activée.")
	}

	// Désactiver la caméra
	else {
		terminate(cameraChildProcess.pid, (err) => {
			if(err) console.error("Impossible de fermer la caméra:", err)
			else console.log("⚠️ Caméra désactivée.")
		})
		cameraChildProcess = null
	}

	// Retourner une réponse
	res.code(200).send("OK")
})

// Servir une route qui permet d'afficher des notifications sur l'écran
fastify.post("/notification", async (req, res) => {
	// Obtenir des informations depuis le body
	var title = req.body.title
	var content = req.body.content
	var iconPath = req.body.iconPath
	var timeout = req.body.timeout
	if(!title || !content || !iconPath) return res.code(400).send("Bad Request")

	// Envoyer la notification dans la fenêtre ElectronJS
	window.webContents.send("notification", { title, content, iconPath, timeout })
	console.log(`Notification envoyée: ${title} - ${content} - ${iconPath} - ${timeout}`)

	// Retourner une réponse
	res.code(200).send("OK")
})

// Configurer une instance Webcam
var webcamOptions = {
	width: 1200,
	quality: 50,
	frames: 1,
	delay: 0,
	saveShots: false,
	output: "jpeg",
	callbackReturn: "buffer",
	device: process.env.VIDEO_DEVICE
}
if(process.env.VIDEO_DEVICE) var webcam = NodeWebcam.create(webcamOptions)

// Faire une photo avec la caméra et déterminer la luminosité dans la pièce
async function executeBrightnessDetection(){
	// Si on doit pas vérifier on annule
	if(!shouldDetectBrightness) return
	if(!webcam) return changeBrightness(100) // si on a pas de caméra, on met la luminosité à 100%

	// Retourner une promise
	return await new Promise((resolve, reject) => {
		webcam.capture(path.join(__dirname, "temp", "camera"), async (err, data) => {
			// Log si on a une erreur
			if(err) return console.log("Impossible de prendre une photo avec la caméra:", err)

			// Supprimer la photo enregistré
			try { fs.unlinkSync(path.join(__dirname, "temp", "camera.jpg")) } catch(err){}

			// Détecter la luminosité, l'augmenter si elle est trop faible, et la définir
			var brightness = await calculateBrightness(data)
			changeBrightness(brightness)

			// Résoudre la promesse
			resolve()
		})
	})
}

// Exécuter les détecteurs de luminosité toutes les 5 minutes
if(process.env.VIDEO_DEVICE) setInterval(executeBrightnessDetection, 5 * 60 * 1000)

// Fonction pour changer la luminosité de l'écran
function changeBrightness(intensity){
	var newIntensity
	if(intensity < 5 && intensity > 1.5) newIntensity = 1
	console.log("Luminosité de l'écran:", intensity, newIntensity ? `(on la met à ${newIntensity})` : "")
	childProcess.exec(`brightnessctl -d "${process.env.SCREEN_DEVICE}" set ${newIntensity || intensity}%`)
}

// Fonction pour calculer la luminosité moyenne d'une image
async function calculateBrightness(imagePath){
	try {
		// Obtenir les dimensions de l'image, puis la charger
		const dimensions = sizeOf(imagePath)
		const width = dimensions.width
		const height = dimensions.height
		const image = await Jimp.read(imagePath)

		// On détermine la somme de base de la luminosité
		let brightnessSum = 0

		// Parcourir chaque pixel de l'image
		image.scan(0, 0, width, height, function (x, y, idx){
			// Extraire l'intensité des 3 couleurs de base
			const red = this.bitmap.data[idx]
			const green = this.bitmap.data[idx + 1]
			const blue = this.bitmap.data[idx + 2]

			// Calculer et ajouter à la somme totale
			const brightness = (red + green + blue) / 3
			brightnessSum += brightness
		})

		// Calculer et retourner la luminosité moyenne
		const averageBrightness = brightnessSum / (width * height)
		return (averageBrightness / 255) * 100 // on l'a retourne en pourcentage
	} catch (err){
		console.error("Impossible de calculer la luminosité d'une photo:", err)
		return 0
	}
}

// Démarrer le serveur web
fastify.listen({ port: process.env.PORT || 3000 }, (err) => {
	if(err) console.error(err), process.exit(1)
	console.log(`Server listening on port ${fastify.server.address().port}`)
})