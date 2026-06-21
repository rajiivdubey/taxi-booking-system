import json
import os
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from enum import StrEnum
from math import radians, sin, cos, sqrt, atan2
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from uuid import uuid4

from fastapi import FastAPI, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator
from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent
REACT_DIST_DIR = BASE_DIR / "frontend" / "dist"
REACT_INDEX = REACT_DIST_DIR / "index.html"
REACT_ASSETS_DIR = REACT_DIST_DIR / "assets"
load_dotenv()

SCHIPHOL = {
    "name": "Schiphol Airport",
    "lat": 52.3105,
    "lng": 4.7683,
}


class VehicleType(StrEnum):
    standard = "standard"
    station_wagon = "station_wagon"
    van = "van"
    business = "business"


class TripDirection(StrEnum):
    to_airport = "to_airport"
    from_airport = "from_airport"


class BookingStatus(StrEnum):
    pending_payment = "pending_payment"
    confirmed = "confirmed"
    cancelled = "cancelled"


class Location(BaseModel):
    label: str = Field(min_length=3, examples=["Amsterdam Centraal"])
    lat: float = Field(ge=-90, le=90, examples=[52.3789])
    lng: float = Field(ge=-180, le=180, examples=[4.9003])


POPULAR_LOCATIONS = [
    Location(label="Amsterdam Centraal", lat=52.3789, lng=4.9003),
    Location(label=SCHIPHOL["name"], lat=SCHIPHOL["lat"], lng=SCHIPHOL["lng"]),
    Location(label="The Hague Central", lat=52.0800, lng=4.3240),
    Location(label="Rotterdam Central", lat=51.9244, lng=4.4699),
    Location(label="Utrecht Central", lat=52.0894, lng=5.1103),
    Location(label="Haarlem Centrum", lat=52.3874, lng=4.6462),
    Location(label="Leiden Central", lat=52.1662, lng=4.4818),
    Location(label="Almere Centrum", lat=52.3508, lng=5.2647),
]


class FareQuoteRequest(BaseModel):
    pickup: Location
    dropoff: Location
    pickup_time: datetime
    passengers: int = Field(ge=1, le=8)
    vehicle_type: VehicleType = VehicleType.standard
    flight_number: str | None = Field(default=None, max_length=20)

    @field_validator("pickup_time")
    @classmethod
    def pickup_must_be_booked_ahead(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)

        # Reference site requires 180 minutes minimum advance reservation.
        if value < datetime.now(UTC) + timedelta(minutes=180):
            raise ValueError("pickup_time must be at least 180 minutes from now")

        return value


class FareQuote(BaseModel):
    quote_id: str
    pickup: Location
    dropoff: Location
    pickup_time: datetime
    passengers: int
    flight_number: str | None = None
    distance_km: float
    duration_minutes: int
    currency: str = "EUR"
    total_price: float
    expires_at: datetime
    vehicle_type: VehicleType


class Customer(BaseModel):
    full_name: str = Field(min_length=2)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=25)


class BookingRequest(BaseModel):
    quote_id: str
    customer: Customer
    notes: str | None = Field(default=None, max_length=500)
    accepts_terms: bool


class Booking(BaseModel):
    booking_id: str
    ride_number: str
    quote: FareQuote
    customer: Customer
    status: BookingStatus
    created_at: datetime
    payment_url: str | None = None
    notes: str | None = None


app = FastAPI(
    title="Airport Taxi Booking Backend",
    version="0.1.0",
    description="Starter backend for a fixed-price airport taxi booking system.",
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
if REACT_ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=REACT_ASSETS_DIR), name="react-assets")

quotes: dict[str, FareQuote] = {}
bookings: dict[str, Booking] = {}


def haversine_km(origin: Location, destination: Location) -> float:
    earth_radius_km = 6371
    lat1, lng1, lat2, lng2 = map(
        radians,
        [origin.lat, origin.lng, destination.lat, destination.lng],
    )
    delta_lat = lat2 - lat1
    delta_lng = lng2 - lng1

    a = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lng / 2) ** 2
    return earth_radius_km * 2 * atan2(sqrt(a), sqrt(1 - a))


def calculate_fixed_price(distance_km: float, passengers: int, vehicle_type: VehicleType) -> float:
    base_prices = {
        VehicleType.standard: 35,
        VehicleType.station_wagon: 45,
        VehicleType.van: 60,
        VehicleType.business: 75,
    }
    per_km_prices = {
        VehicleType.standard: 1.65,
        VehicleType.station_wagon: 1.85,
        VehicleType.van: 2.15,
        VehicleType.business: 2.45,
    }

    passenger_surcharge = 0 if passengers <= 4 else 12
    raw_price = base_prices[vehicle_type] + distance_km * per_km_prices[vehicle_type] + passenger_surcharge

    # Round to a clean customer-facing fixed fare.
    return round(raw_price / 5) * 5


def vehicle_for_passengers(passengers: int) -> VehicleType:
    if passengers <= 4:
        return VehicleType.standard
    if passengers <= 6:
        return VehicleType.station_wagon
    return VehicleType.van


def send_admin_notification(booking: Booking):
    """Sends an email notification to the admin about a new booking."""

    smtp_server = "smtp.gmail.com"
    smtp_port = 587
    smtp_user = os.getenv("SMTP_USERNAME", "rajiivdubey@gmail.com")
    smtp_pass = os.getenv("SMTP_PASSWORD", None)
    admin_email = os.getenv("ADMIN_EMAIL", "rajeevcool321@gmail.com")

    msg = EmailMessage()
    msg["Subject"] = f"New Taxi Booking: {booking.ride_number}"
    msg["From"] = smtp_user
    msg["To"] = f"{booking.customer.email}, {admin_email}"

    content = f"""
    New booking received:
    
    Ride Number: {booking.ride_number}
    Status: {booking.status}
    
    CUSTOMER DETAILS
    ----------------
    Name: {booking.customer.full_name}
    Email: {booking.customer.email}
    Phone: {booking.customer.phone}
    
    TRIP DETAILS
    ------------
    Pickup: {booking.quote.pickup.label}
    Dropoff: {booking.quote.dropoff.label}
    Pickup Time: {booking.quote.pickup_time.strftime('%Y-%m-%d %H:%M')}
    Passengers: {booking.quote.passengers}
    Vehicle Type: {booking.quote.vehicle_type}
    Flight Number: {booking.quote.flight_number or 'N/A'}
    
    PRICE
    -----
    Total: {booking.quote.total_price} {booking.quote.currency}
    
    Notes: {booking.notes or 'None'}
    
    Booking ID: {booking.booking_id}
    """
    msg.set_content(content)

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            if smtp_user and smtp_pass:
                server.starttls()
                server.login(smtp_user, smtp_pass)
            server.send_message(msg)
    except Exception as e:
        # In a real app, use proper logging
        print(f"CRITICAL: Failed to send admin email: {e}")


@app.get("/", include_in_schema=False)
def demo_page() -> FileResponse:
    if REACT_INDEX.exists():
        return FileResponse(REACT_INDEX)

    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "docs": "/docs",
    }


@app.get("/locations", response_model=list[Location])
def list_locations() -> list[Location]:
    return POPULAR_LOCATIONS


@app.post("/quotes", response_model=FareQuote, status_code=status.HTTP_201_CREATED)
def create_quote(request: FareQuoteRequest) -> FareQuote:
    distance_km = haversine_km(request.pickup, request.dropoff)
    road_distance_km = distance_km * 1.25
    duration_minutes = max(15, round(road_distance_km / 65 * 60))
    assigned_vehicle_type = vehicle_for_passengers(request.passengers)

    quote = FareQuote(
        quote_id=str(uuid4()),
        pickup=request.pickup,
        dropoff=request.dropoff,
        pickup_time=request.pickup_time,
        passengers=request.passengers,
        flight_number=request.flight_number,
        distance_km=round(road_distance_km, 1),
        duration_minutes=duration_minutes,
        total_price=calculate_fixed_price(road_distance_km, request.passengers, assigned_vehicle_type),
        expires_at=datetime.now(UTC) + timedelta(minutes=20),
        vehicle_type=assigned_vehicle_type,
    )
    quotes[quote.quote_id] = quote
    return quote


@app.post("/bookings", response_model=Booking, status_code=status.HTTP_201_CREATED)
def create_booking(request: BookingRequest, background_tasks: BackgroundTasks) -> Booking:
    if not request.accepts_terms:
        raise HTTPException(status_code=400, detail="Terms must be accepted before booking")

    quote = quotes.get(request.quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    if quote.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=410, detail="Quote expired")

    # Create a mutable copy of the quote to modify its price if needed
    updated_quote = quote.model_copy()

    # Check for child seat request in notes and add cost
    if request.notes and "child seat" in request.notes.lower():
        updated_quote.total_price += 5.00

    booking_id = str(uuid4())
    booking = Booking(
        booking_id=booking_id,
        ride_number=f"TX-{datetime.now(UTC):%Y%m%d}-{len(bookings) + 1:05d}",
        quote=updated_quote,
        customer=request.customer,
        status=BookingStatus.pending_payment,
        created_at=datetime.now(UTC),
        payment_url=f"https://payments.example.test/checkout/{booking_id}",
        notes=request.notes,
    )
    bookings[booking_id] = booking
    background_tasks.add_task(send_admin_notification, booking)

    return booking


@app.get("/bookings/{booking_id}", response_model=Booking)
def get_booking(booking_id: str) -> Booking:
    booking = bookings.get(booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@app.post("/bookings/{booking_id}/cancel", response_model=Booking)
def cancel_booking(booking_id: str) -> Booking:
    booking = bookings.get(booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status == BookingStatus.cancelled:
        return booking

    updated = booking.model_copy(update={"status": BookingStatus.cancelled})
    bookings[booking_id] = updated
    return updated

if __name__ == "__main__":
    import os
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8080))
    )