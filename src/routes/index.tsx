import { createFileRoute } from "@tanstack/react-router";
import { ZombieGame } from "@/components/ZombieGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dead Sector — Top-Down Zombie Survival" },
      {
        name: "description",
        content:
          "Survive endless waves of the undead in Dead Sector, a round-based top-down zombie shooter. Rack up points, buy weapons, and hold the line.",
      },
      { property: "og:title", content: "Dead Sector — Top-Down Zombie Survival" },
      {
        property: "og:description",
        content:
          "Round-based top-down zombie shooter. Survive, earn points, upgrade your arsenal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <ZombieGame />;
}
