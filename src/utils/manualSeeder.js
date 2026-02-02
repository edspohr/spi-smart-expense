import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export const seedTestUsers = async () => {
  const users = [
    {
      email: "admin@spiamericas.com",
      password: "123",
      role: "admin",
      name: "Admin User",
    },
    {
      email: "usuario@spiamericas.com",
      password: "123",
      role: "professional",
      name: "Usuario Test",
    },
  ];

  console.log("Starting manual seed...");

  for (const u of users) {
    try {
      const pass = u.password.length < 6 ? "123456" : u.password;
      let user;

      console.log(`Processing ${u.email}...`);

      try {
        // Try to create
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          u.email,
          pass,
        );
        user = userCredential.user;
        console.log(`Created user authentication for ${u.email}`);
      } catch (authErr) {
        if (authErr.code === "auth/email-already-in-use") {
          console.log(`${u.email} exists in Auth. Logging in...`);
          try {
            const userCredential = await signInWithEmailAndPassword(
              auth,
              u.email,
              pass,
            );
            user = userCredential.user;
          } catch (loginErr) {
            console.error(`Login failed for ${u.email}:`, loginErr);
            continue; // Skip if we can't login
          }
        } else {
          throw authErr;
        }
      }

      if (user) {
        console.log(`Writing profile for ${u.email} (${u.role})...`);
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: u.email,
          displayName: u.name,
          role: u.role,
          balance: 0,
          updatedAt: new Date().toISOString(),
        });
        console.log(`SUCCESS: Profile written for ${u.email}`);
      }

      await signOut(auth);
    } catch (e) {
      console.error(`FATAL Error processing ${u.email}:`, e);
    }
  }
  console.log("Manual seed complete.");
  alert(
    "Usuarios configurados: admin@spiamericas.com y usuario@spiamericas.com (clave: 123456)",
  );
};
