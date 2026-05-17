export interface LayoutInfo {
  width: number;
  height: number;
  tooSmall: boolean;
}

export class ResponsiveLayoutService {
  compute(width: number, height: number): LayoutInfo {
    return {
      width,
      height,
      tooSmall: width < 960 || height < 540
    };
  }
}
