import React from "react";
import { Composition } from "remotion";
import { Promo, PROMO_FRAMES } from "./Promo";
import { MapFly } from "./scenes/MapFly";
import { ColdOpen, Problem } from "./scenes/Text";
import { Hook, Title } from "./scenes/Hook";
import { Built, Business, Decide, EndCollage, Glasses, PovHook, Thumbnail } from "./scenes/Scenes3";
import { TrustDiagram } from "./scenes/Trust";
import { EndCard, Models } from "./scenes/End";
import { CompareScene, NotebookScene, PhoneFeature, TitleScene } from "./scenes/Features";

const base = { fps: 30, width: 1920, height: 1080 };

export const Root: React.FC = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={PROMO_FRAMES} {...base} />
    <Composition id="T-Map" component={MapFly} durationInFrames={288} {...base} />
    <Composition id="T-Open" component={ColdOpen} durationInFrames={436} {...base} />
    <Composition id="T-Problem" component={Problem} durationInFrames={327} {...base} />
    <Composition id="T-Trust" component={TrustDiagram} durationInFrames={300} {...base} />
    <Composition id="T-Models" component={Models} durationInFrames={220} {...base} />
    <Composition id="T-End" component={EndCard} durationInFrames={220} {...base} />
    <Composition id="T-Title" component={TitleScene} durationInFrames={218} {...base} />
    <Composition id="T-Compare" component={CompareScene} durationInFrames={436} {...base} />
    <Composition id="T-Notebook" component={NotebookScene} durationInFrames={600} {...base} />
    <Composition
      id="T-Sim"
      component={() => <PhoneFeature src="captures/simwalk.mp4" video caps={[{ at: 0, title: "probe" }]} />}
      durationInFrames={5600}
      {...base}
    />
    <Composition id="T-Hook" component={Hook} durationInFrames={360} {...base} />
    <Composition id="T-Title2" component={Title} durationInFrames={144} {...base} />
    <Composition id="T-Pov" component={PovHook} durationInFrames={360} {...base} />
    <Composition id="T-Decide" component={Decide} durationInFrames={432} {...base} />
    <Composition id="T-Built" component={Built} durationInFrames={216} {...base} />
    <Composition id="T-Business" component={Business} durationInFrames={360} {...base} />
    <Composition id="T-Glasses" component={Glasses} durationInFrames={432} {...base} />
    <Composition id="T-EndC" component={EndCollage} durationInFrames={216} {...base} />
    <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} {...base} />
  </>
);
