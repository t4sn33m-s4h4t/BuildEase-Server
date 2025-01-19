
# BuildEase API Server

## Overview

BuildEase API Server is a backend system built with Express, MongoDB, and Stripe for a building management system. This server handles user registration, apartment rental agreements, payment processing, coupon management, and announcements for a real estate platform. 

The API is fully RESTful and includes features like user authentication with JWT tokens, admin role verification, and secure payment processing via Stripe.

You can access the live version of the platform here: [BuildEase](https://buildease-rho.vercel.app/)

## Setup

1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file at the root with the following variables:
   - `PAYMENT_SECRET_KEY`: Your Stripe secret key.
   - `PORT`: The port for the server (default is 5000).
   - `mongoDBUserName`: Your MongoDB username.
   - `mongoDBPass`: Your MongoDB password.
   - `JWT_SECRET`: Secret key for JWT.
   - `JWT_EXPIRES_IN`: Expiration time for JWT tokens (default is 50 days).

4. Run the server:
   ```bash
   npm start
   ```

## API Routes

### Authentication

- **POST** `/jwt` - Generate a JWT token for authentication.
- **PUT** `/register` - Register a new user (email and name).

### Users

- **GET** `/users` - Fetch a list of all members (Admin only).
- **PUT** `/users/:email` - Remove a member (Admin only).
- **GET** `/userRole` - Get the current user's role.

### Apartments

- **GET** `/apartments` - Fetch a list of apartments (supports pagination and rent filter).
- **GET** `/apartment/:id` - Get details of a specific apartment by ID.

### Agreements

- **POST** `/apartments/agreement` - Create an apartment rental agreement (Authenticated users).
- **GET** `/agreements` - Get all pending agreements (Admin only).
- **GET** `/agreement/:userEmail` - Get the agreement for a user by their email.
- **PUT** `/agreement/:id` - Accept or reject an agreement (Admin only).

### Coupons

- **GET** `/coupons` - Fetch all available coupons.
- **POST** `/coupons` - Add a new coupon (Admin only).
- **DELETE** `/coupon/:id` - Delete a coupon (Admin only).
- **PATCH** `/coupon/:id` - Mark a coupon as expired (Admin only).

### Announcements

- **GET** `/announcements` - Get all announcements.
- **POST** `/announcements` - Add a new announcement (Admin only).

### Payments

- **GET** `/payment-history` - Get the user's payment history.
- **POST** `/payment-history` - Add a new payment record.
- **POST** `/make-payment` - Create a payment intent and process payment (Authenticated users).

