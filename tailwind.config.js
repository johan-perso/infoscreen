/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./src/**/*.{html,js}",
		"./js/**/*.{html,js}"
	],
	plugins: [
		require("tailwindcss-animate"),
	]
}