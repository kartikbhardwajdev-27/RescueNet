


const pages = document.querySelectorAll(".page");
const navItems = document.querySelectorAll(".nav-item");

const pageNames = [
    "home",
    "map",
    "report",
    "shelters",
    "resources",
    "about"
];

let currentPage = 0;




function showPage(index) {

    if (index < 0) {
        index = pageNames.length - 1;
    }

    if (index >= pageNames.length) {
        index = 0;
    }

    currentPage = index;

    pages.forEach((page, i) => {

        page.classList.toggle(
            "active-page",
            i === currentPage
        );

    });


    // Update sidebar

    navItems.forEach(item => {

        item.classList.remove("active");

        if (
            item.dataset.page ===
            pageNames[currentPage]
        ) {

            item.classList.add("active");

        }

    });


    // Update dots

    updateDots();

}


// ========================================
// GO TO PAGE
// ========================================

function goToPage(pageName) {

    const index =
        pageNames.indexOf(pageName);

    if (index !== -1) {

        showPage(index);

    }

}


// ========================================
// SIDEBAR NAVIGATION
// ========================================

navItems.forEach(item => {

    item.addEventListener("click", () => {

        const page =
            item.dataset.page;

        goToPage(page);

    });

});


// ========================================
// NEXT / PREVIOUS
// ========================================

const nextPage =
    document.querySelector("#nextPage");

const previousPage =
    document.querySelector("#previousPage");


nextPage.addEventListener("click", () => {

    showPage(currentPage + 1);

});


previousPage.addEventListener("click", () => {

    showPage(currentPage - 1);

});


// ========================================
// PAGE DOTS
// ========================================

const pageDots =
    document.querySelector("#pageDots");


pageNames.forEach((page, index) => {

    const dot =
        document.createElement("span");

    dot.className = "page-dot";

    dot.addEventListener("click", () => {

        showPage(index);

    });

    pageDots.appendChild(dot);

});


function updateDots() {

    const dots =
        document.querySelectorAll(".page-dot");

    dots.forEach((dot, index) => {

        dot.classList.toggle(
            "active",
            index === currentPage
        );

    });

}


// ========================================
// SWIPE SUPPORT
// ========================================

let touchStartX = 0;
let touchEndX = 0;


document.addEventListener("touchstart", function(event) {

    touchStartX =
        event.changedTouches[0].screenX;

});


document.addEventListener("touchend", function(event) {

    touchEndX =
        event.changedTouches[0].screenX;

    handleSwipe();

});


function handleSwipe() {

    const difference =
        touchStartX - touchEndX;


    // Swipe LEFT

    if (difference > 70) {

        showPage(currentPage + 1);

    }


    // Swipe RIGHT

    if (difference < -70) {

        showPage(currentPage - 1);

    }

}


// ========================================
// KEYBOARD NAVIGATION
// ========================================

document.addEventListener("keydown", function(event) {

    if (event.key === "ArrowRight") {

        showPage(currentPage + 1);

    }

    if (event.key === "ArrowLeft") {

        showPage(currentPage - 1);

    }

});



// ========================================
// TOAST
// ========================================

function showToast(message) {

    const toast =
        document.querySelector("#toast");

    if (!toast) return;

    toast.innerText = message;

    toast.classList.add("show");


    setTimeout(() => {

        toast.classList.remove("show");

    }, 2500);

}



// ========================================
// SOS
// ========================================

function sendSOS() {

    const confirmSOS = confirm(
        "Are you sure you want to send an emergency SOS alert?"
    );


    if (confirmSOS) {

        showToast(
            "SOS alert sent. Nearby responders have been notified."
        );

    }

}



// ========================================
// INCIDENT TYPE
// ========================================

const incidents =
    document.querySelectorAll(".incident");


incidents.forEach(button => {

    button.addEventListener("click", () => {

        incidents.forEach(item => {

            item.classList.remove("active");

        });

        button.classList.add("active");

    });

});



// ========================================
// FILE UPLOAD
// ========================================

const fileInput =
    document.querySelector("#fileInput");

const uploadText =
    document.querySelector("#uploadText");


if (fileInput) {

    fileInput.addEventListener("change", () => {

        if (fileInput.files.length === 0) {

            uploadText.innerText =
                "Upload Images or Videos";

        } else {

            uploadText.innerText =
                `${fileInput.files.length} file(s) selected`;

        }

    });

}



// ========================================
// SUBMIT REPORT
// ========================================

const submitReport =
    document.querySelector("#submitReport");


if (submitReport) {

    submitReport.addEventListener("click", () => {

        const description =
            document.querySelector("#description");

        const location =
            document.querySelector("#location");


        if (!description.value.trim()) {

            showToast(
                "Please describe the incident."
            );

            description.focus();

            return;

        }


        if (!location.value.trim()) {

            showToast(
                "Please enter the incident location."
            );

            location.focus();

            return;

        }


        const selected =
            document.querySelector(
                ".incident.active"
            );


        const type =
            selected ?
            selected.dataset.type :
            "Other";


        showToast(
            `${type} incident reported successfully.`
        );


        // Clear form after successful report

        description.value = "";
        location.value = "";

        if (fileInput) {

            fileInput.value = "";

        }

        if (uploadText) {

            uploadText.innerText =
                "Upload Images or Videos";

        }

    });

}



// ========================================
// GET LOCATION
// ========================================

function getLocation() {

    if (!navigator.geolocation) {

        showToast(
            "Geolocation is not supported by this browser."
        );

        return;

    }


    showToast(
        "Getting your location..."
    );


    navigator.geolocation.getCurrentPosition(

        function(position) {

            const latitude =
                position.coords.latitude;

            const longitude =
                position.coords.longitude;


            const locationInput =
                document.querySelector("#location");


            if (locationInput) {

                locationInput.value =
                    `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

            }


            showToast(
                "Your location has been detected."
            );

        },


        function() {

            showToast(
                "Unable to access your location."
            );

        }

    );

}



// ========================================
// SHELTER SEARCH
// ========================================

const shelterSearch =
    document.querySelector("#shelterSearch");


if (shelterSearch) {

    shelterSearch.addEventListener(
        "input",
        function() {

            const search =
                shelterSearch.value
                    .toLowerCase()
                    .trim();


            const shelterCards =
                document.querySelectorAll(
                    ".shelter-card"
                );


            shelterCards.forEach(card => {

                const name =
                    card
                        .querySelector("h3")
                        .innerText
                        .toLowerCase();


                const address =
                    card
                        .querySelector("p")
                        .innerText
                        .toLowerCase();


                if (
                    name.includes(search) ||
                    address.includes(search)
                ) {

                    card.style.display =
                        "grid";

                } else {

                    card.style.display =
                        "none";

                }

            });

        }
    );

}



// ========================================
// SHELTER LOCATION
// ========================================

function getShelterLocation() {

    if (!navigator.geolocation) {

        showToast(
            "Location is not supported by this browser."
        );

        return;

    }


    showToast(
        "Finding shelters near you..."
    );


    navigator.geolocation.getCurrentPosition(

        function() {

            showToast(
                "Nearby shelters updated."
            );

        },

        function() {

            showToast(
                "Unable to access your location."
            );

        }

    );

}





const directionButtons =
    document.querySelectorAll(
        ".shelter-status button"
    );


directionButtons.forEach(button => {

    button.addEventListener("click", () => {

        const shelter =
            button
                .closest(".shelter-card")
                .querySelector("h3")
                .innerText;


        showToast(
            `Directions requested for ${shelter}.`
        );

    });

});



// ========================================
// MAP FILTERS
// ========================================

const filters =
    document.querySelectorAll(".filter");


filters.forEach(filter => {

    filter.addEventListener("click", () => {

        filters.forEach(item => {

            item.classList.remove("active");

        });

        filter.classList.add("active");


        showToast(
            `${filter.innerText.trim()} filter selected.`
        );

    });

});



// ========================================
// MAP ZOOM
// ========================================

const zoomButtons =
    document.querySelectorAll(
        ".map-controls button"
    );


let mapZoom = 1;


zoomButtons.forEach(button => {

    button.addEventListener("click", () => {

        if (button.innerText === "+") {

            mapZoom += 0.1;

        } else {

            mapZoom -= 0.1;

        }


        if (mapZoom < 0.7) {

            mapZoom = 0.7;

        }

        if (mapZoom > 1.6) {

            mapZoom = 1.6;

        }


        document.querySelector(
            ".large-map"
        ).style.transform =
            `scale(${mapZoom})`;

    });

});




showPage(0);