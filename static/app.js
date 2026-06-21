const fallbackLocations = [
  { label: "Amsterdam Centraal", lat: 52.3789, lng: 4.9003 },
  { label: "Schiphol Airport", lat: 52.3105, lng: 4.7683 },
  { label: "The Hague Central", lat: 52.08, lng: 4.324 },
  { label: "Rotterdam Central", lat: 51.9244, lng: 4.4699 },
  { label: "Utrecht Central", lat: 52.0894, lng: 5.1103 },
  { label: "Haarlem Centrum", lat: 52.3874, lng: 4.6462 },
  { label: "Leiden Central", lat: 52.1662, lng: 4.4818 },
  { label: "Almere Centrum", lat: 52.3508, lng: 5.2647 }
];

const state = {
  locations: fallbackLocations,
  quote: null
};

const pickupSelect = document.querySelector("#pickup");
const dropoffSelect = document.querySelector("#dropoff");
const pickupTimeInput = document.querySelector("#pickupTime");
const passengersInput = document.querySelector("#passengers");
const vehicleTypeSelect = document.querySelector("#vehicleType");
const flightNumberInput = document.querySelector("#flightNumber");
const quoteForm = document.querySelector("#quoteForm");
const bookingForm = document.querySelector("#bookingForm");
const quoteError = document.querySelector("#quoteError");
const bookingError = document.querySelector("#bookingError");
const quoteResult = document.querySelector("#quoteResult");
const bookingSuccess = document.querySelector("#bookingSuccess");

function toDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "T" + [pad(date.getHours()), pad(date.getMinutes())].join(":");
}

function roundedFutureDate(hoursAhead) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  const roundedMinutes = Math.ceil(date.getMinutes() / 15) * 15;
  date.setMinutes(roundedMinutes, 0, 0);
  return date;
}

function selectedLocation(select) {
  return state.locations[Number(select.value)];
}

function fillLocationSelect(select) {
  select.innerHTML = "";
  state.locations.forEach((location, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = location.label;
    select.append(option);
  });
}

function setSelectByLabel(select, label) {
  const index = state.locations.findIndex((location) => location.label === label);
  select.value = String(index >= 0 ? index : 0);
}

function setDirection(direction) {
  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.direction === direction);
  });

  if (direction === "from_airport") {
    setSelectByLabel(pickupSelect, "Schiphol Airport");
    setSelectByLabel(dropoffSelect, "Amsterdam Centraal");
  } else {
    setSelectByLabel(pickupSelect, "Amsterdam Centraal");
    setSelectByLabel(dropoffSelect, "Schiphol Airport");
  }
}

function vehicleLabel(value) {
  const labels = {
    standard: "Standard",
    station_wagon: "Station wagon",
    van: "Van",
    business: "Business"
  };
  return labels[value] || value;
}

function requiredVehicleForPassengers(passengers) {
  if (passengers <= 4) {
    return "standard";
  }

  if (passengers <= 6) {
    return "station_wagon";
  }

  return "van";
}

function updateVehicleChoice() {
  const passengers = Math.min(Math.max(Number(passengersInput.value) || 1, 1), 8);
  passengersInput.value = String(passengers);
  vehicleTypeSelect.value = requiredVehicleForPassengers(passengers);
}

function apiErrorMessage(payload, fallback) {
  if (Array.isArray(payload.detail) && payload.detail.length > 0) {
    return payload.detail.map((item) => item.msg).join(" ");
  }

  if (typeof payload.detail === "string") {
    return payload.detail;
  }

  return fallback;
}

function scrollToStep(element) {
  requestAnimationFrame(() => {
    const topbar = document.querySelector(".topbar");
    const offset = topbar ? topbar.getBoundingClientRect().height + 16 : 16;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({
      top: Math.max(top, 0),
      behavior: "smooth"
    });
  });
}

async function loadLocations() {
  try {
    const response = await fetch("/locations");
    if (!response.ok) {
      throw new Error("Locations request failed");
    }
    state.locations = await response.json();
  } catch {
    state.locations = fallbackLocations;
  }

  fillLocationSelect(pickupSelect);
  fillLocationSelect(dropoffSelect);
  setDirection("to_airport");
}

async function submitQuote(event) {
  event.preventDefault();
  updateVehicleChoice();
  quoteError.textContent = "";
  bookingError.textContent = "";
  bookingSuccess.hidden = true;
  bookingForm.hidden = true;
  quoteResult.hidden = true;
  state.quote = null;

  const pickup = selectedLocation(pickupSelect);
  const dropoff = selectedLocation(dropoffSelect);

  if (pickup.label === dropoff.label) {
    quoteError.textContent = "Choose different pickup and drop-off locations.";
    return;
  }

  const submitButton = quoteForm.querySelector("button[type='submit']");
  submitButton.disabled = true;

  try {
    const response = await fetch("/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pickup,
        dropoff,
        pickup_time: new Date(pickupTimeInput.value).toISOString(),
        passengers: Number(passengersInput.value),
        vehicle_type: vehicleTypeSelect.value,
        flight_number: flightNumberInput.value || null
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(apiErrorMessage(payload, "Could not calculate the fare."));
    }

    state.quote = payload;
    document.querySelector("#quotePrice").textContent = `${payload.currency} ${payload.total_price.toFixed(2)}`;
    document.querySelector("#quoteDistance").textContent = `${payload.distance_km} km`;
    document.querySelector("#quoteDuration").textContent = `${payload.duration_minutes} min`;
    document.querySelector("#quoteVehicle").textContent = vehicleLabel(payload.vehicle_type);
    quoteResult.hidden = false;
    bookingForm.hidden = false;
    scrollToStep(quoteResult);
  } catch (error) {
    quoteError.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function submitBooking(event) {
  event.preventDefault();
  bookingError.textContent = "";

  if (!state.quote) {
    bookingError.textContent = "Calculate a fare before confirming the booking.";
    return;
  }

  const submitButton = bookingForm.querySelector("button[type='submit']");
  submitButton.disabled = true;

  try {
    const response = await fetch("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quote_id: state.quote.quote_id,
        customer: {
          full_name: document.querySelector("#fullName").value,
          email: document.querySelector("#email").value,
          phone: document.querySelector("#phone").value
        },
        notes: document.querySelector("#notes").value || null,
        accepts_terms: document.querySelector("#acceptsTerms").checked
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(apiErrorMessage(payload, "Could not create the booking."));
    }

    document.querySelector("#rideNumber").textContent = payload.ride_number;
    document.querySelector("#bookingStatus").textContent = payload.status.replace("_", " ");
    document.querySelector("#paymentLink").href = payload.payment_url;
    bookingSuccess.hidden = false;
    scrollToStep(bookingSuccess);
  } catch (error) {
    bookingError.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => setDirection(button.dataset.direction));
});

passengersInput.addEventListener("input", updateVehicleChoice);
quoteForm.addEventListener("submit", submitQuote);
bookingForm.addEventListener("submit", submitBooking);

pickupTimeInput.min = toDateTimeLocal(new Date(Date.now() + 185 * 60 * 1000));
pickupTimeInput.value = toDateTimeLocal(roundedFutureDate(4));
updateVehicleChoice();

loadLocations();
