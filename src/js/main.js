// Importation
const { ipcRenderer } = require("electron")

// Variables
var timetable

// Fonction pour échapper les caractères spéciaux
function escapeHtml(text){
	if(!text) return text
	if(typeof text != "string") return text
	return text?.replace(/&/g, "&amp;")?.replace(/</g, "&lt;")?.replace(/>/g, "&gt;")?.replace(/"/g, "&quot;")?.replace(/'/g, "&#039;")
}

// Fonction pour faire clignoter le body
async function blinkBody(){
	document.body.classList.add("border", "border-white", "border-4", "rounded-md")
	await new Promise(resolve => setTimeout(resolve, 80))

	document.body.classList.remove("border", "border-white", "border-4", "rounded-md")
	await new Promise(resolve => setTimeout(resolve, 120))

	return true
}

// Fonction pour afficher une notification
async function showNotification(title, content, iconPath, timeout = 5000){
	// Générer un ID unique
	var notifId = Date.now()

	// Code HTML de la notification
	var html = `<div id="notif-${notifId}" class="max-w-[50vw] animate-in slide-in-from-right duration-300 p-4 rounded-2xl backdrop-blur bg-white/70 text-black/80 flex place-items-center justify-items-center">
	<img src="${escapeHtml(iconPath)}" class="w-16 h-16 rounded-2xl">
		<div class="ml-4 p-2 text-black">
			<p class="text-xl font-bold">${escapeHtml(title)}</p>
			<p class="text-lg font-medium">${escapeHtml(content)}</p>
		</div>
	</div>`

	// L'ajouter à la page
	document.getElementById("notifications").insertAdjacentHTML("beforeend", html)

	// Faire clignoter en blanc les bordures du body
	await blinkBody()
	await blinkBody()

	// Retirer la notification après un certain temps
	setTimeout(() => {
		document.getElementById(`notif-${notifId}`).classList.remove("slide-in-from-right", "animate-in")
		document.getElementById(`notif-${notifId}`).classList.add("slide-out-to-right", "animate-out")
		setTimeout(() => {
			document.getElementById(`notif-${notifId}`).remove()
		}, 300)
	}, timeout)
}

// Quand on reçoit un message du processus principal
ipcRenderer.on("notification", async (event, arg) => {
	await showNotification(arg.title, arg.content, arg.iconPath, arg.timeout)
})
ipcRenderer.on("timetable", (event, arg) => {
	timetable = arg
})
ipcRenderer.on("camera", (event, arg) => {
	if(arg == true) document.getElementById("recIndicator").style.display = ""
	else document.getElementById("recIndicator").style.display = "none"
})
ipcRenderer.on("dotenv", (event, arg) => {
	if(arg.key == "HA_DASHBOARD") document.getElementById("homeAssistant").src = arg.value
	else if(arg.key == "SPOTIFY_MINIPLAYER") document.getElementById("spotifyPlayer").src = arg.value
})
ipcRenderer.on("battery", (event, arg) => {
	if(arg == "hide") return document.getElementById("battery_container").style.display = "none"

	document.getElementById("battery_level").innerText = `${arg}%`
	document.getElementById("battery_container").style.display = ""
})
ipcRenderer.on("weather", (event, arg) => {
	document.getElementById("info_temperature").innerText = `${Math.round(arg?.temp_c)}°C`
	document.getElementById("info_temperature").style.backgroundImage = `url('https:${arg.condition.icon}')`
	document.getElementById("temperatureContainer").classList.remove("hidden")
})

// Si on a pas reçu d'élements pour la deuxième colonne, on passe en écran unique
setTimeout(() => {
	// Si on a Spotify mais pas Home Assistant
	if(document.getElementById("spotifyPlayer").src && !document.getElementById("homeAssistant").src){
		console.log("Hiding Home Assistant and resizing Spotify because of content received")

		document.getElementById("spotifyPlayer").src = "https://nowplayi.ng/playing.php" // on passe sur un lecteur plus grand
		document.getElementById("spotifyPlayer").parentElement.classList.remove("h-1/4")
		document.getElementById("spotifyPlayer").parentElement.classList.add("h-full")
		document.getElementById("homeAssistant").parentElement.classList.add("hidden")
		document.getElementById("homeAssistant").remove()
	}

	// Si on a Home Assistant mais pas Spotify
	else if(document.getElementById("homeAssistant").src && !document.getElementById("spotifyPlayer").src){
		console.log("Hiding Spotify and resizing Home Assistant because of content received")

		document.getElementById("homeAssistant").parentElement.classList.remove("h-3/4", "mt-2")
		document.getElementById("homeAssistant").parentElement.classList.add("h-full")
		document.getElementById("spotifyPlayer").parentElement.classList.add("hidden")
		document.getElementById("spotifyPlayer").remove()
	}

	// Si on a ni Spotify ni Home Assistant
	else if(!document.getElementById("spotifyPlayer").src && !document.getElementById("homeAssistant").src){
		console.log("Hiding second column because no content was received for it")

		document.getElementById("secondColumn").classList.add("hidden")
		document.getElementById("firstColumn").style.gridArea = ""
		document.body.style.gridTemplateColumns = ""
		document.body.style.gridTemplateRows = ""
	}
}, 20000)

// Arrondir la cover Spotify
document.getElementById("spotifyPlayer").addEventListener("dom-ready", () => {
	document.getElementById("spotifyPlayer").insertCSS("[x-show=\"showArtwork\"]{ border-radius: 5px !important; }")
})

// Augmenter le niveau de zoom du dashboard Home Assistant
document.getElementById("homeAssistant").addEventListener("dom-ready", () => {
	document.getElementById("homeAssistant").setZoomFactor(1.22)
})

// On actualise certaines données à intervalles réguliers
setInterval(() => { // on met à jour l'heure
	document.getElementById("info_time").innerText = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}, 1000)
setInterval(() => { // on met à jour la date
	document.getElementById("info_date").innerText = new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })
}, 5000)
setInterval(() => { // on met à jour la barre de progression et on affiche une notif quand on a cours
	// Obtenir des informations sur le premier cours
	var firstCourse = timetable?.[0]
	if(!firstCourse) return
	var firstCourseStart = new Date(firstCourse.start)
	firstCourseStart.setMinutes(firstCourseStart.getMinutes() - 5) // enlever 5 minutes à l'heure de début

	// Dans combien de temps le cours commence ?
	var timeBeforeFirstCourse = firstCourseStart.getTime() - new Date().getTime()
	var timeBeforeFirstCourseInMinutes = Math.round(timeBeforeFirstCourse / 1000 / 60)
	console.log(timeBeforeFirstCourseInMinutes); console.log(firstCourse)

	// Si le cours commence dans moins d'une heure
	if(timeBeforeFirstCourseInMinutes <= 60 && timeBeforeFirstCourseInMinutes > 0){
		// On affiche la barre de progression
		document.getElementById("mainProgressbarContainer").style.display = "grid"

		// On met à jour la barre de progression
		document.getElementById("mainProgressbar").style.width = `${100 - (timeBeforeFirstCourseInMinutes / 60 * 100)}%`

		// Si on est à moins de 40 minutes du début, on affiche une notification
		if(timeBeforeFirstCourseInMinutes <= 40 && !firstCourse.showedNotif){
			firstCourse.showedNotif = true
			showNotification("Pronote", `${firstCourse.subject.name} ― ${firstCourse.rooms.length ? `Salle ${firstCourse.rooms.join(", ")} ― ` : ""}${firstCourseStart.toLocaleTimeString("fr-FR", { hour: "numeric", minute: "2-digit" })}`, "img/pronote.png", 40 * 60 * 1000)
		}
	}

	// S'il a commencé
	if(timeBeforeFirstCourseInMinutes <= 0){
		// On enlève la barre de progression
		document.getElementById("mainProgressbarContainer").style.display = "none"

		// On enlève le cours de l'emploi du temps
		timetable.shift()
	}
}, 5000)