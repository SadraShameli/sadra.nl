import Head from 'next/head';
import { useCallback } from 'react';

import { loadFull } from 'tsparticles';
import Particles from 'react-tsparticles';
import { type Engine } from 'tsparticles-engine';

import Resume from '~/data/Resume';
import MainPage from '~/components/Home/MainPage';

export default function Home() {
    const particlesInit = useCallback(async (engine: Engine) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await loadFull(engine);
    }, []);

    return (
        <>
            <Head>
                <title>{Resume.title}</title>
                <meta name='description' content={Resume.description} />
                <link rel='icon' href='/favicon.ico' />
            </Head>

            <MainPage {...Resume} />

            <Particles
                init={particlesInit}
                options={{
                    smooth: true,
                    particles: {
                        number: {
                            value: 50,
                            density: {
                                enable: true,
                                value_area: 2048,
                            },
                        },
                        color: {
                            value: '#ffffff',
                        },
                        opacity: {
                            value: 0.5,
                            random: false,
                            anim: {
                                enable: false,
                                speed: 1,
                                opacity_min: 0.1,
                                sync: false,
                            },
                        },
                        line_linked: {
                            enable: true,
                            distance: 150,
                            color: '#ffffff',
                            opacity: 0.4,
                            width: 1,
                        },
                        move: {
                            enable: true,
                            speed: 2,
                            bounce: true,
                        },
                    },
                    interactivity: {
                        detect_on: 'window',
                        events: {
                            onhover: {
                                enable: true,
                                mode: 'repulse',
                            },
                        },
                    },
                }}
            />
        </>
    );
}
