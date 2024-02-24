// A INSERER DANS LA CONFIG HOME ASSISTANT (FRONTEND) //
// N'EST PAS UTILE POUR FAIRE FONCTIONNER INFOSCREEN  //

setTimeout(() => {
	if(new URLSearchParams(window.location.search).get("hide_top_bar") == "true"){
		document
			.querySelector("home-assistant").shadowRoot
			.querySelector("home-assistant-main").shadowRoot
			.querySelector("ha-panel-lovelace").shadowRoot
			.querySelector("hui-root").shadowRoot
			.querySelector("#view").style.paddingTop = "0px"

		document
			.querySelector("home-assistant")?.shadowRoot
			?.querySelector("home-assistant-main")?.shadowRoot
			?.querySelector("ha-panel-lovelace")?.shadowRoot
			?.querySelector("hui-root")?.shadowRoot
			?.querySelector(".header").remove()
	}

	if(new URLSearchParams(window.location.search).get("round_borders") == "true"){
		document
			.querySelector("home-assistant").shadowRoot
			.querySelector("home-assistant-main").shadowRoot
			.querySelector("ha-panel-lovelace").shadowRoot
			.querySelector("hui-root").shadowRoot
			.querySelector("hui-view").style.borderRadius = "var(--ha-card-border-radius,12px)"

		document.body.style.backgroundColor = "transparent"
	}
}, 5000)