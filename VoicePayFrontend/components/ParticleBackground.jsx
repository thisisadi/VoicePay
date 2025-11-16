"use client";

import { useCallback, useMemo, useEffect, useState } from "react";
import Particles from "@tsparticles/react";
import { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

export default function ParticleBackground() {
    const [init, setInit] = useState(false);

    useEffect(() => {
        initParticlesEngine(async (engine) => {
            await loadSlim(engine);
        }).then(() => {
            setInit(true);
        });
    }, []);

    const particlesLoaded = useCallback(async (container) => {
        // Particles loaded
    }, []);

    const options = useMemo(
        () => ({
            background: {
                color: {
                    value: "transparent",
                },
            },
            fpsLimit: 60,
            interactivity: {
                events: {
                    onClick: {
                        enable: false,
                    },
                    onHover: {
                        enable: true,
                        mode: "grab",
                    },
                    resize: true,
                },
                modes: {
                    grab: {
                        distance: 200,
                        links: {
                            opacity: 0.5,
                        },
                    },
                },
            },
            particles: {
                color: {
                    value: ["#00E0FF", "#A855F7"],
                },
                links: {
                    color: "#A855F7",
                    distance: 150,
                    enable: true,
                    opacity: 0.3,
                    width: 1,
                },
                move: {
                    direction: "none",
                    enable: true,
                    outModes: {
                        default: "bounce",
                    },
                    random: true,
                    speed: 0.2,
                    straight: false,
                },
                number: {
                    density: {
                        enable: true,
                        area: 1200,
                    },
                    value: 120,
                },
                opacity: {
                    value: { min: 0.4, max: 0.8 },
                    animation: {
                        enable: true,
                        speed: 0.3,
                        sync: false,
                    },
                },
                shape: {
                    type: "circle",
                },
                size: {
                    value: { min: 1.5, max: 3 },
                    animation: {
                        enable: true,
                        speed: 1.5,
                        sync: false,
                    },
                },
            },
            detectRetina: true,
        }),
        []
    );

    if (!init) {
        return null;
    }

    return (
        <Particles
            id="tsparticles"
            particlesLoaded={particlesLoaded}
            options={options}
            className="absolute inset-0 -z-10"
        />
    );
}

