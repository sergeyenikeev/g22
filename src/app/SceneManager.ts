export class SceneManager<TScene extends string> {
  private current: TScene;

  constructor(initial: TScene) {
    this.current = initial;
  }

  set(scene: TScene): void {
    this.current = scene;
  }

  get(): TScene {
    return this.current;
  }
}
