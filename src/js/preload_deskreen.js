// On attend que la page est chargée
window.addEventListener("load", async () => {
	// On masque le curseur sur toute la page
	document.documentElement.style.cursor = "none"
	document.body.style.cursor = "none"

	// Si on est pas sur Deskreen, on ignore
	if(document.head.querySelector("title").innerText !== "Deskreen Viewer") return

	// On rend la page plus propre
	document.documentElement.style.backgroundColor = "black"
	document.documentElement.style.overflow = "hidden"

	// On attend que la page soit chargée
	while(document.querySelector(".bp3-heading") === null) await new Promise(r => setTimeout(r, 100))

	// On finit de rendre la page plus propre
	document.querySelector(".react-reveal").style.backgroundColor = "black"
	Array.from(document.querySelectorAll(".bp3-heading")).forEach(e => { if(e?.style) e.style.color = "white" })

	// On essaye de déterminer quand on est connecté
	var removeBordersInterval = setInterval(() => {
		// On récupère le conteneur qui contient le stream de l'écran
		const videoContainer = document.getElementById("video-container")

		// Si on ne l'a pas trouvé, on ignore
		if(!videoContainer) return

		// Sinon, on supprime l'interval, ainsi que les bordures
		clearInterval(removeBordersInterval)
		document.querySelector(".bp3-card.bp3-elevation-4").remove()
	}, 700)
})